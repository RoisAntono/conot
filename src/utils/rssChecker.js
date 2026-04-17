const Parser = require("rss-parser");
const { RSS_RETRY_ATTEMPTS, YOUTUBE_RSS_URL } = require("../config/constants");
const { passesContentFilter } = require("./contentFilter");
const { buildNotificationEmbed } = require("./embedFactory");
const { decodeHtmlEntities } = require("./htmlEntities");
const { resolveCustomMessage } = require("./messageTemplate");
const { withRetry } = require("./networkRetry");
const { passesTitleFilter } = require("./titleFilter");
const { buildThumbnailUrl, buildWatchUrl } = require("./youtubeUrl");

const parser = new Parser({
  timeout: 15000,
  customFields: {
    item: [
      ["yt:videoId", "videoId"],
      ["media:group", "mediaGroup"],
      ["media:content", "mediaContent"],
      ["published", "publishedAt"]
    ]
  }
});

function buildFeedUrl(channelId) {
  return `${YOUTUBE_RSS_URL}${channelId}`;
}

function extractVideoId(entry) {
  if (entry?.videoId) {
    return entry.videoId;
  }

  const idMatch = String(entry?.id || "").match(/yt:video:([a-zA-Z0-9_-]{11})/);
  if (idMatch?.[1]) {
    return idMatch[1];
  }

  try {
    const url = new URL(entry.link);
    return url.searchParams.get("v");
  } catch {
    return null;
  }
}

function extractDurationSeconds(entry) {
  const candidates = [
    entry?.mediaGroup?.["media:content"]?.["$"]?.duration,
    entry?.mediaContent?.["$"]?.duration,
    entry?.enclosure?.duration
  ];

  for (const candidate of candidates) {
    const duration = Number(candidate);
    if (Number.isFinite(duration) && duration > 0) {
      return duration;
    }
  }

  return null;
}

function classifyContent(entry) {
  const durationSeconds = extractDurationSeconds(entry);
  const link = String(entry?.link || "");
  const title = String(entry?.title || "");

  const isShort = (
    link.includes("/shorts/") ||
    /(^|\s)#?shorts(\s|$)/i.test(title) ||
    (durationSeconds !== null && durationSeconds <= 60)
  );

  return {
    durationSeconds,
    isShort,
    label: isShort ? "[SHORTS]" : "[VIDEO]"
  };
}

function normalizeFeedChannelTitle(feed) {
  return decodeHtmlEntities(feed?.title || "").replace(/\s*-\s*YouTube\s*$/i, "") || null;
}

function mapFeedEntryToVideo(feed, entry) {
  const videoId = extractVideoId(entry);
  if (!videoId) {
    return null;
  }

  return {
    videoId,
    title: decodeHtmlEntities(entry.title || "Tanpa Judul"),
    link: entry.link || buildWatchUrl(videoId),
    thumbnailUrl: buildThumbnailUrl(videoId),
    publishedAt: entry.publishedAt || entry.pubDate || entry.isoDate || null,
    channelTitle: normalizeFeedChannelTitle(feed),
    ...classifyContent(entry)
  };
}

async function parseFeedWithRetry(channelId) {
  const feedUrl = buildFeedUrl(channelId);
  return withRetry(
    () => parser.parseURL(feedUrl),
    { attempts: RSS_RETRY_ATTEMPTS }
  );
}

async function fetchLatestVideo(channelId) {
  const feed = await parseFeedWithRetry(channelId);
  const latestEntry = feed?.items?.[0];

  if (!latestEntry) {
    return null;
  }

  return mapFeedEntryToVideo(feed, latestEntry);
}

async function fetchRecentVideos(channelId, limit = 5) {
  const feed = await parseFeedWithRetry(channelId);
  const items = Array.isArray(feed?.items) ? feed.items.slice(0, Math.max(1, limit)) : [];

  return items
    .map((entry) => mapFeedEntryToVideo(feed, entry))
    .filter(Boolean);
}

function shouldNotifyForVideo(trackedChannel, latestVideo) {
  return (
    passesContentFilter(trackedChannel.notifications?.contentFilter, latestVideo) &&
    passesTitleFilter(
      trackedChannel.notifications?.titleFilters ?? trackedChannel.notifications?.titleFilter,
      latestVideo
    )
  );
}

function formatNotificationMessage(trackedChannel, latestVideo, options = {}) {
  const roleMention = !options.suppressRoleMention && trackedChannel.discord.roleId
    ? `<@&${trackedChannel.discord.roleId}>`
    : null;
  const renderedMessage = resolveCustomMessage(
    trackedChannel.notifications?.customMessage,
    latestVideo,
    trackedChannel
  );
  const content = [options.contentPrefix || null, renderedMessage, roleMention].filter(Boolean).join("\n");

  return {
    content,
    embeds: [
      buildNotificationEmbed({
        trackedChannel,
        latestVideo
      })
    ],
    allowedMentions: !options.suppressRoleMention && trackedChannel.discord.roleId
      ? { roles: [trackedChannel.discord.roleId] }
      : { parse: [] }
  };
}

function buildStatusTransitionText(trackedChannel, latestVideo) {
  const channelName = trackedChannel.youtube.title || trackedChannel.youtube.username || latestVideo.channelTitle || "channel ini";
  return `Update status dari ${channelName}: ${latestVideo.contentLabel || "konten terbaru"} sekarang tersedia.`;
}

function formatStatusTransitionMessage(trackedChannel, latestVideo) {
  const roleMention = trackedChannel.discord.roleId ? `<@&${trackedChannel.discord.roleId}>` : null;
  const content = [buildStatusTransitionText(trackedChannel, latestVideo), roleMention]
    .filter(Boolean)
    .join("\n");

  return {
    content,
    embeds: [
      buildNotificationEmbed({
        trackedChannel,
        latestVideo
      })
    ],
    allowedMentions: trackedChannel.discord.roleId
      ? { roles: [trackedChannel.discord.roleId] }
      : { parse: [] }
  };
}

module.exports = {
  buildFeedUrl,
  fetchLatestVideo,
  fetchRecentVideos,
  formatNotificationMessage,
  formatStatusTransitionMessage,
  shouldNotifyForVideo
};
