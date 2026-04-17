const axios = require("axios");
const {
  DEFAULT_HEADERS,
  HTTP_RETRY_ATTEMPTS,
  YOUTUBE_BASE_URL
} = require("../config/constants");
const { decodeHtmlEntities } = require("./htmlEntities");
const { withRetry } = require("./networkRetry");
const { extractObject } = require("./youtubeJsonExtractor");
const { buildThumbnailUrl, buildWatchUrl } = require("./youtubeUrl");

function extractWatchVideoIdFromUrl(value) {
  try {
    const url = new URL(value);
    return url.searchParams.get("v");
  } catch {
    return null;
  }
}

function extractCanonicalUrl(html) {
  return html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1] || null;
}

function getRunsText(runs) {
  return Array.isArray(runs)
    ? runs.map((item) => item?.text || "").join("").trim()
    : "";
}

function getScheduledStartFromOfflineSlate(offlineSlate) {
  const unixSeconds = Number(
    offlineSlate?.liveStreamOfflineSlateRenderer?.scheduledStartTime ||
    offlineSlate?.scheduledStartTime
  );

  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return null;
  }

  return new Date(unixSeconds * 1000).toISOString();
}

function detectMembersOnly(playerResponse, html) {
  const microformat = playerResponse?.microformat?.playerMicroformatRenderer || {};
  const playabilityStatus = playerResponse?.playabilityStatus || {};
  const errorReason = [
    playabilityStatus?.reason,
    playabilityStatus?.errorScreen?.playerErrorMessageRenderer?.reason?.simpleText,
    playabilityStatus?.errorScreen?.playerErrorMessageRenderer?.subreason?.simpleText
  ].filter(Boolean).join(" ").toLowerCase();
  const htmlLower = String(html || "").toLowerCase();

  return (
    microformat?.hasYpcMetadata === true ||
    errorReason.includes("members only") ||
    errorReason.includes("member-only") ||
    errorReason.includes("join this channel") ||
    htmlLower.includes("badge_style_type_members_only") ||
    htmlLower.includes("members only")
  );
}

function detectPremiere(playerResponse, html) {
  const playabilityStatus = playerResponse?.playabilityStatus || {};
  const offlineSlate = playabilityStatus?.liveStreamability?.liveStreamabilityRenderer?.offlineSlate || null;
  const textBlob = [
    playabilityStatus?.reason,
    playabilityStatus?.errorScreen?.playerErrorMessageRenderer?.reason?.simpleText,
    getRunsText(offlineSlate?.liveStreamOfflineSlateRenderer?.mainText?.runs),
    offlineSlate?.liveStreamOfflineSlateRenderer?.subtitleText?.simpleText
  ].filter(Boolean).join(" ").toLowerCase();

  return (
    textBlob.includes("premiere") ||
    String(html || "").toLowerCase().includes("premiere")
  );
}

function isFullTimestamp(value) {
  return typeof value === "string" && value.includes("T");
}

function pickPublishedAt(primaryValue, fallbackValue) {
  if (isFullTimestamp(primaryValue)) {
    return primaryValue;
  }

  if (isFullTimestamp(fallbackValue)) {
    return fallbackValue;
  }

  return primaryValue || fallbackValue || null;
}

function classifyBroadcastStatus(playerResponse, html, fallbackVideo) {
  const details = playerResponse?.videoDetails || {};
  const liveBroadcastDetails = playerResponse?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails || null;
  const playabilityStatus = playerResponse?.playabilityStatus || {};
  const offlineSlate = playabilityStatus?.liveStreamability?.liveStreamabilityRenderer?.offlineSlate || null;
  const membersOnly = detectMembersOnly(playerResponse, html);
  const isPremiere = detectPremiere(playerResponse, html);
  const scheduledStartAt = liveBroadcastDetails?.startTimestamp || getScheduledStartFromOfflineSlate(offlineSlate);
  const isReplayFromLiveContent = (
    details?.isLiveContent === true &&
    details?.isLive !== true &&
    details?.isUpcoming !== true &&
    !liveBroadcastDetails?.isLiveNow
  );
  const publishedAt = pickPublishedAt(
    playerResponse?.microformat?.playerMicroformatRenderer?.publishDate
      || playerResponse?.microformat?.playerMicroformatRenderer?.uploadDate
      || null,
    fallbackVideo?.publishedAt || null
  );

  if (liveBroadcastDetails?.isLiveNow || details?.isLive === true) {
    return {
      contentState: membersOnly ? "members_live" : "live",
      contentLabel: membersOnly ? "Stream Khusus Pelanggan" : "Sedang Live",
      membersOnly,
      isPremiere,
      scheduledStartAt,
      publishedAt,
      startedAt: liveBroadcastDetails?.startTimestamp || null
    };
  }

  if ((details?.isUpcoming === true) || (scheduledStartAt && !liveBroadcastDetails?.endTimestamp)) {
    return {
      contentState: isPremiere
        ? (membersOnly ? "members_premiere_upcoming" : "premiere_upcoming")
        : (membersOnly ? "members_upcoming" : "upcoming"),
      contentLabel: isPremiere
        ? (membersOnly ? "Premier Video Khusus Pelanggan (Akan Datang)" : "Premier Video (Akan Datang)")
        : (membersOnly ? "Stream Khusus Pelanggan (Akan Datang)" : "Stream Akan Datang"),
      membersOnly,
      isPremiere,
      scheduledStartAt,
      publishedAt
    };
  }

  if (details?.isPostLiveDvr === true || liveBroadcastDetails?.endTimestamp || isReplayFromLiveContent) {
    return {
      contentState: membersOnly
        ? "members_replay_stream"
        : (isPremiere ? "premiere_video" : "replay_stream"),
      contentLabel: membersOnly
        ? "Replay Stream Khusus Pelanggan"
        : (isPremiere ? "Premier Video" : "Replay Stream"),
      membersOnly,
      isPremiere,
      scheduledStartAt,
      publishedAt,
      startedAt: liveBroadcastDetails?.startTimestamp || null,
      endedAt: liveBroadcastDetails?.endTimestamp || null
    };
  }

  if (fallbackVideo?.isShort) {
    return {
      contentState: "shorts",
      contentLabel: "Shorts",
      membersOnly,
      isPremiere,
      scheduledStartAt,
      publishedAt
    };
  }

  return {
    contentState: membersOnly
      ? (isPremiere ? "members_premiere_video" : "members_video")
      : (isPremiere ? "premiere_video" : "uploaded"),
    contentLabel: membersOnly
      ? (isPremiere ? "Premier Video Khusus Pelanggan" : "Video Khusus Pelanggan")
      : (isPremiere ? "Premier Video" : "Video Panjang"),
    membersOnly,
    isPremiere,
    scheduledStartAt,
    publishedAt
  };
}

async function inspectYouTubeVideo(videoId, fallbackVideo = null) {
  const url = buildWatchUrl(videoId);
  const response = await withRetry(
    () => axios.get(url, {
      headers: DEFAULT_HEADERS,
      timeout: 15000,
      maxRedirects: 5
    }),
    { attempts: HTTP_RETRY_ATTEMPTS }
  );

  const playerResponseRaw = extractObject(response.data, "ytInitialPlayerResponse = ");
  if (!playerResponseRaw) {
    throw new Error(`Gagal mengekstrak ytInitialPlayerResponse untuk video ${videoId}.`);
  }

  const playerResponse = JSON.parse(playerResponseRaw);
  const details = playerResponse.videoDetails || {};
  const microformat = playerResponse.microformat?.playerMicroformatRenderer || {};
  const statusMeta = classifyBroadcastStatus(playerResponse, response.data, fallbackVideo);

  return {
    videoId,
    watchUrl: buildWatchUrl(videoId),
    title: decodeHtmlEntities(details.title || microformat.title?.simpleText || null),
    thumbnailUrl: buildThumbnailUrl(videoId),
    scheduledStartAt: statusMeta.scheduledStartAt || null,
    startedAt: statusMeta.startedAt || null,
    endedAt: statusMeta.endedAt || null,
    publishedAt: statusMeta.publishedAt || null,
    membersOnly: statusMeta.membersOnly || false,
    isPremiere: statusMeta.isPremiere || false,
    contentState: statusMeta.contentState,
    contentLabel: statusMeta.contentLabel
  };
}

async function inspectYouTubeLiveHandle(channelHandle, expectedVideoId, fallbackVideo = null) {
  const normalizedHandle = String(channelHandle || "").trim().toLowerCase();

  if (!normalizedHandle.startsWith("@")) {
    return null;
  }

  const url = `${YOUTUBE_BASE_URL}/${normalizedHandle}/live`;
  const response = await withRetry(
    () => axios.get(url, {
      headers: DEFAULT_HEADERS,
      timeout: 15000,
      maxRedirects: 5
    }),
    { attempts: HTTP_RETRY_ATTEMPTS }
  );

  const canonicalUrl = extractCanonicalUrl(response.data);
  const canonicalVideoId = extractWatchVideoIdFromUrl(canonicalUrl || "");
  const finalVideoId = extractWatchVideoIdFromUrl(response.request?.res?.responseUrl || "");

  if (canonicalVideoId !== expectedVideoId && finalVideoId !== expectedVideoId) {
    return null;
  }

  const playerResponseRaw = extractObject(response.data, "ytInitialPlayerResponse = ");
  if (!playerResponseRaw) {
    return {
      videoId: expectedVideoId,
      watchUrl: buildWatchUrl(expectedVideoId),
      title: decodeHtmlEntities(fallbackVideo?.title || null),
      thumbnailUrl: fallbackVideo?.thumbnailUrl || buildThumbnailUrl(expectedVideoId),
      scheduledStartAt: null,
      startedAt: null,
      endedAt: null,
      publishedAt: fallbackVideo?.publishedAt || null,
      membersOnly: false,
      isPremiere: false,
      contentState: "live",
      contentLabel: "Sedang Live"
    };
  }

  const playerResponse = JSON.parse(playerResponseRaw);
  const details = playerResponse.videoDetails || {};
  const microformat = playerResponse.microformat?.playerMicroformatRenderer || {};
  const statusMeta = classifyBroadcastStatus(playerResponse, response.data, fallbackVideo);

  return {
    videoId: expectedVideoId,
    watchUrl: buildWatchUrl(expectedVideoId),
    title: decodeHtmlEntities(details.title || microformat.title?.simpleText || fallbackVideo?.title || null),
    thumbnailUrl: fallbackVideo?.thumbnailUrl || buildThumbnailUrl(expectedVideoId),
    scheduledStartAt: statusMeta.scheduledStartAt || null,
    startedAt: statusMeta.startedAt || null,
    endedAt: statusMeta.endedAt || null,
    publishedAt: statusMeta.publishedAt || fallbackVideo?.publishedAt || null,
    membersOnly: statusMeta.membersOnly || false,
    isPremiere: statusMeta.isPremiere || false,
    contentState: statusMeta.contentState,
    contentLabel: statusMeta.contentLabel
  };
}

function mergeInspectedVideo(baseVideo, inspectedVideo) {
  const fallbackLabel = baseVideo.isShort ? "Shorts" : "Video Panjang";
  const fallbackState = baseVideo.isShort ? "shorts" : "uploaded";

  return {
    ...baseVideo,
    title: inspectedVideo?.title || baseVideo.title,
    link: inspectedVideo?.watchUrl || baseVideo.link,
    thumbnailUrl: inspectedVideo?.thumbnailUrl || baseVideo.thumbnailUrl,
    contentState: inspectedVideo?.contentState || fallbackState,
    contentLabel: inspectedVideo?.contentLabel || fallbackLabel,
    scheduledStartAt: inspectedVideo?.scheduledStartAt || null,
    startedAt: inspectedVideo?.startedAt || null,
    endedAt: inspectedVideo?.endedAt || null,
    publishedAt: inspectedVideo?.publishedAt || baseVideo.publishedAt || null,
    membersOnly: inspectedVideo?.membersOnly || false,
    isPremiere: inspectedVideo?.isPremiere || false
  };
}

module.exports = {
  __private: {
    classifyBroadcastStatus,
    detectMembersOnly,
    detectPremiere
  },
  inspectYouTubeLiveHandle,
  inspectYouTubeVideo,
  mergeInspectedVideo
};
