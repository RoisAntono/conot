const axios = require("axios");
const {
  DEFAULT_HEADERS,
  HTTP_RETRY_ATTEMPTS,
  YOUTUBE_BASE_URL
} = require("../config/constants");
const { decodeHtmlEntities } = require("./htmlEntities");
const { matchesKeyword } = require("./titleMatcher");
const { extractObject } = require("./youtubeJsonExtractor");
const { withRetry } = require("./networkRetry");
const { buildThumbnailUrl, buildWatchUrl } = require("./youtubeUrl");

const SEARCH_RESULTS_URL = `${YOUTUBE_BASE_URL}/results`;
const VIDEOS_FILTER_SP = "EgIQAQ%253D%253D";
const RELATIVE_TIME_MULTIPLIERS = {
  seconds: 1000,
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
  months: 30 * 24 * 60 * 60 * 1000,
  years: 365 * 24 * 60 * 60 * 1000
};

function getRunsText(value) {
  if (!value) {
    return null;
  }

  if (typeof value.simpleText === "string") {
    return decodeHtmlEntities(value.simpleText).trim();
  }

  if (Array.isArray(value.runs)) {
    return decodeHtmlEntities(value.runs.map((item) => item?.text || "").join("")).trim();
  }

  return null;
}

function walkVideoRenderers(node, output = []) {
  if (!node || typeof node !== "object") {
    return output;
  }

  if (node.videoRenderer) {
    output.push(node.videoRenderer);
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      walkVideoRenderers(item, output);
    }

    return output;
  }

  for (const value of Object.values(node)) {
    walkVideoRenderers(value, output);
  }

  return output;
}

function getThumbnailUrl(renderer) {
  const thumbnails = renderer?.thumbnail?.thumbnails;
  if (!Array.isArray(thumbnails) || !thumbnails.length) {
    return renderer?.videoId ? buildThumbnailUrl(renderer.videoId) : null;
  }

  return thumbnails[thumbnails.length - 1]?.url || null;
}

function getChannelHandle(renderer) {
  const browseEndpoint = renderer?.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint;
  return browseEndpoint?.canonicalBaseUrl || null;
}

function getRelativePublishedText(renderer) {
  return getRunsText(renderer?.publishedTimeText) || null;
}

function parseDurationText(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  const parts = normalized
    .split(":")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item >= 0);

  if (!parts.length || parts.length > 3) {
    return null;
  }

  let durationSeconds = 0;
  for (const part of parts) {
    durationSeconds = (durationSeconds * 60) + part;
  }

  return durationSeconds > 0 ? durationSeconds : null;
}

function parseRelativePublishedAt(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    return null;
  }

  const patterns = [
    { regex: /(\d+)\s*(year|years|yr|yrs|y|tahun)\b/, unit: "years" },
    { regex: /(\d+)\s*(month|months|mo|mos|bulan)\b/, unit: "months" },
    { regex: /(\d+)\s*(week|weeks|wk|wks|w|minggu)\b/, unit: "weeks" },
    { regex: /(\d+)\s*(day|days|d|hari)\b/, unit: "days" },
    { regex: /(\d+)\s*(hour|hours|hr|hrs|h|jam)\b/, unit: "hours" },
    { regex: /(\d+)\s*(minute|minutes|min|mins|m|menit)\b/, unit: "minutes" },
    { regex: /(\d+)\s*(second|seconds|sec|secs|s|detik)\b/, unit: "seconds" }
  ];

  const now = Date.now();

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (!match) {
      continue;
    }

    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    return new Date(now - (amount * RELATIVE_TIME_MULTIPLIERS[pattern.unit])).toISOString();
  }

  return null;
}

function detectReplayByPublishedText(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    return false;
  }

  return (
    text.includes("streamed") ||
    text.includes("live streamed") ||
    text.includes("live streaming") ||
    text.includes("streaming") ||
    text.includes("siaran langsung")
  );
}

function detectSearchResultState(renderer, publishedText = null) {
  const badgeLabels = [
    ...(renderer?.badges || []),
    ...(renderer?.ownerBadges || [])
  ]
    .map((badge) => badge?.metadataBadgeRenderer?.label || badge?.metadataBadgeRenderer?.tooltip || "")
    .join(" ")
    .toLowerCase();

  const overlayStyle = renderer?.thumbnailOverlays?.find((item) => item?.thumbnailOverlayTimeStatusRenderer)
    ?.thumbnailOverlayTimeStatusRenderer?.style;
  const durationText = getRunsText(renderer?.lengthText);
  const durationSeconds = parseDurationText(durationText);
  const titleText = getRunsText(renderer?.title) || "";
  const isShort = (
    overlayStyle === "SHORTS" ||
    badgeLabels.includes("shorts") ||
    /(^|\s)#?shorts(\s|$)/i.test(titleText) ||
    (durationSeconds !== null && durationSeconds <= 60)
  );

  if (overlayStyle === "LIVE" || badgeLabels.includes("live")) {
    return {
      contentState: "live",
      contentLabel: "Sedang Live",
      durationSeconds,
      isShort: false
    };
  }

  if (renderer?.upcomingEventData?.startTime) {
    return {
      contentState: "upcoming",
      contentLabel: "Stream Akan Datang",
      scheduledStartAt: new Date(Number(renderer.upcomingEventData.startTime) * 1000).toISOString(),
      durationSeconds,
      isShort: false
    };
  }

  if (detectReplayByPublishedText(publishedText)) {
    return {
      contentState: "replay_stream",
      contentLabel: "Replay Stream",
      durationSeconds,
      isShort: false
    };
  }

  if (isShort) {
    return {
      contentState: "shorts",
      contentLabel: "Shorts",
      durationSeconds,
      isShort: true
    };
  }

  return {
    contentState: "uploaded",
    contentLabel: "Video Panjang",
    durationSeconds,
    isShort: false
  };
}

function mapVideoRenderer(renderer) {
  if (!renderer?.videoId) {
    return null;
  }

  const publishedText = getRelativePublishedText(renderer);
  const stateMeta = detectSearchResultState(renderer, publishedText);

  return {
    videoId: renderer.videoId,
    title: getRunsText(renderer.title) || "Tanpa Judul",
    link: buildWatchUrl(renderer.videoId),
    thumbnailUrl: getThumbnailUrl(renderer),
    channelTitle: getRunsText(renderer.ownerText || renderer.longBylineText) || "Channel Tidak Dikenal",
    channelHandle: getChannelHandle(renderer),
    publishedText,
    publishedAt: parseRelativePublishedAt(publishedText),
    durationText: getRunsText(renderer.lengthText),
    ...stateMeta
  };
}

function sortByNewest(items) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.publishedAt || left.scheduledStartAt || 0).getTime();
    const rightTime = new Date(right.publishedAt || right.scheduledStartAt || 0).getTime();
    return rightTime - leftTime;
  });
}

async function searchYouTubeVideos(query, limit = 10) {
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) {
    return [];
  }

  const response = await withRetry(
    () => axios.get(SEARCH_RESULTS_URL, {
      headers: DEFAULT_HEADERS,
      timeout: 15000,
      maxRedirects: 5,
      params: {
        search_query: normalizedQuery,
        sp: VIDEOS_FILTER_SP
      }
    }),
    { attempts: HTTP_RETRY_ATTEMPTS }
  );

  const initialDataRaw = extractObject(response.data, "ytInitialData = ");
  if (!initialDataRaw) {
    throw new Error(`Gagal mengekstrak ytInitialData untuk query "${normalizedQuery}".`);
  }

  const initialData = JSON.parse(initialDataRaw);
  const mappedVideos = walkVideoRenderers(initialData)
    .map(mapVideoRenderer)
    .filter(Boolean)
    .filter((video) => matchesKeyword(normalizedQuery, video.title));

  return sortByNewest(mappedVideos).slice(0, Math.max(1, limit));
}

module.exports = {
  __private: {
    detectReplayByPublishedText,
    detectSearchResultState,
    parseDurationText
  },
  searchYouTubeVideos
};
