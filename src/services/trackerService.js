const { EmbedBuilder } = require("discord.js");
const { MAX_TRACKERS_PER_GUILD } = require("../config/constants");
const fileDb = require("../utils/fileDb");
const { getContentFilterLabel, normalizeContentFilter } = require("../utils/contentFilter");
const { normalizeEmbedLayout } = require("../utils/embedLayout");
const rssChecker = require("../utils/rssChecker");
const { normalizeCustomMessage } = require("../utils/messageTemplate");
const { getTitleFilterLabel, normalizeTitleFilters } = require("../utils/titleFilter");
const { buildThumbnailUrl } = require("../utils/youtubeUrl");
const youtubeScraper = require("../utils/youtubeScraper");

class TrackerValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "TrackerValidationError";
    this.isValidationError = true;
  }
}

function truncateText(value, maxLength = 90) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

function ensureSourceRefreshAllowed(identifier, refreshSource) {
  if (!refreshSource) {
    return;
  }

  if (youtubeScraper.looksLikeChannelId(identifier)) {
    throw new TrackerValidationError(
      "Refresh source hanya bisa dipakai jika input berupa handle YouTube (contoh: @namaChannel), bukan channel ID."
    );
  }
}

async function assertGuildTrackerLimit(guildId, existingTracker) {
  if (existingTracker) {
    return;
  }

  const trackers = await fileDb.getTrackedChannelsByGuild(guildId);
  if (trackers.length >= MAX_TRACKERS_PER_GUILD) {
    throw new TrackerValidationError(
      `Batas tracker server tercapai (${MAX_TRACKERS_PER_GUILD}). Hapus tracker lama atau naikkan limit instance.`
    );
  }
}

async function addChannelTracker({ guildId, username, targetChannelId, roleId, contentFilter, customMessage, titleFilter, embedLayout }) {
  const youtubeInfo = await youtubeScraper.scrapeYouTubeChannel(username);
  const existing = await fileDb.findTrackedChannel(guildId, youtubeInfo.channelId);
  await assertGuildTrackerLimit(guildId, existing);

  let latestVideo = null;
  try {
    latestVideo = await rssChecker.fetchLatestVideo(youtubeInfo.channelId);
  } catch {
    latestVideo = null;
  }

  assertHandleResolutionConsistency(youtubeInfo, latestVideo);

  const result = await fileDb.upsertTrackedChannel({
    youtube: {
      username: youtubeInfo.username,
      channelId: youtubeInfo.channelId,
      title: youtubeInfo.title || latestVideo?.channelTitle || null
    },
    discord: {
      guildId,
      channelId: targetChannelId,
      roleId: roleId || null
    },
    notifications: {
      contentFilter: normalizeContentFilter(contentFilter || existing?.notifications?.contentFilter),
      embedLayout: normalizeEmbedLayout(embedLayout || existing?.notifications?.embedLayout),
      customMessage: normalizeCustomMessage(customMessage) ?? existing?.notifications?.customMessage ?? null,
      titleFilters: normalizeTitleFilters(
        titleFilter ?? existing?.notifications?.titleFilters ?? existing?.notifications?.titleFilter ?? []
      )
    },
    lastVideoId: latestVideo?.videoId || existing?.lastVideoId || null,
    lastVideoUrl: latestVideo?.link || existing?.lastVideoUrl || null,
    lastPublishedAt: latestVideo?.publishedAt || existing?.lastPublishedAt || null,
    lastContentState: latestVideo?.contentState || existing?.lastContentState || null,
    lastNotifiedVideoId: existing?.lastNotifiedVideoId ?? null,
    lastNotifiedContentState: existing?.lastNotifiedContentState ?? null
  });

  return {
    ...result,
    latestVideo,
    youtubeInfo
  };
}

async function updateChannelTracker({
  guildId,
  username,
  targetChannelId,
  roleId,
  removeRole = false,
  contentFilter,
  embedLayout,
  customMessage,
  titleFilter,
  clearTitleFilter = false,
  refreshSource = false
}) {
  const identifier = youtubeScraper.normalizeYouTubeInput(username);
  const existing = await fileDb.findTrackedChannel(guildId, identifier);

  if (!existing) {
    return null;
  }

  ensureSourceRefreshAllowed(identifier, refreshSource);

  let sourceYouTube = {
    username: existing.youtube.username,
    channelId: existing.youtube.channelId,
    title: existing.youtube.title
  };

  if (refreshSource) {
    const scrapedYouTube = await youtubeScraper.scrapeYouTubeChannel(username);
    sourceYouTube = {
      username: scrapedYouTube.username,
      channelId: scrapedYouTube.channelId,
      title: scrapedYouTube.title || existing.youtube.title
    };
  }

  let latestVideo = null;
  try {
    latestVideo = await rssChecker.fetchLatestVideo(sourceYouTube.channelId);
  } catch {
    latestVideo = null;
  }

  if (refreshSource) {
    assertHandleResolutionConsistency(sourceYouTube, latestVideo);
  }

  const isSourceChanged = sourceYouTube.channelId !== existing.youtube.channelId;
  const normalizedTitleFilters = clearTitleFilter
    ? []
    : normalizeTitleFilters(
        titleFilter
          ?? existing.notifications?.titleFilters
          ?? existing.notifications?.titleFilter
          ?? []
      );

  const payload = {
    youtube: {
      username: sourceYouTube.username,
      channelId: sourceYouTube.channelId,
      title: sourceYouTube.title || latestVideo?.channelTitle || existing.youtube.title
    },
    discord: {
      guildId,
      channelId: targetChannelId || existing.discord.channelId,
      roleId: removeRole ? null : (roleId ?? existing.discord.roleId ?? null)
    },
    notifications: {
      contentFilter: normalizeContentFilter(contentFilter || existing.notifications?.contentFilter),
      embedLayout: normalizeEmbedLayout(embedLayout || existing.notifications?.embedLayout),
      customMessage: customMessage === null
        ? null
        : (normalizeCustomMessage(customMessage) ?? existing.notifications?.customMessage ?? null),
      titleFilters: normalizedTitleFilters
    },
    lastVideoId: isSourceChanged
      ? (latestVideo?.videoId || null)
      : existing.lastVideoId,
    lastVideoUrl: isSourceChanged
      ? (latestVideo?.link || null)
      : existing.lastVideoUrl,
    lastPublishedAt: isSourceChanged
      ? (latestVideo?.publishedAt || null)
      : existing.lastPublishedAt,
    lastContentState: isSourceChanged
      ? (latestVideo?.contentState || null)
      : existing.lastContentState,
    lastNotifiedVideoId: isSourceChanged
      ? null
      : existing.lastNotifiedVideoId,
    lastNotifiedContentState: isSourceChanged
      ? null
      : existing.lastNotifiedContentState
  };

  const result = isSourceChanged
    ? await fileDb.replaceTrackedChannel(guildId, identifier, payload)
    : await fileDb.upsertTrackedChannel(payload);

  const fallbackLatestVideo = (
    (isSourceChanged ? payload.lastVideoUrl : existing.lastVideoUrl)
      ? {
          title: payload.lastVideoId || "Video terakhir tersimpan",
          link: payload.lastVideoUrl,
          thumbnailUrl: payload.lastVideoId ? buildThumbnailUrl(payload.lastVideoId) : null
        }
      : null
  );

  return {
    ...result,
    youtubeInfo: sourceYouTube,
    latestVideo: latestVideo || fallbackLatestVideo
  };
}

async function removeChannelTracker(guildId, username) {
  const identifier = youtubeScraper.normalizeYouTubeInput(username);
  return fileDb.removeTrackedChannel(guildId, identifier);
}

async function listTrackedChannels(guildId) {
  return fileDb.getTrackedChannelsByGuild(guildId);
}

function buildTrackedChannelsEmbed(trackedChannels, guildPrefix) {
  const maxVisible = 8;
  const visibleEntries = trackedChannels.slice(0, maxVisible);
  const hiddenCount = Math.max(0, trackedChannels.length - visibleEntries.length);

  return new EmbedBuilder()
    .setColor(0x2563eb)
    .setTitle("Daftar Tracker YouTube")
    .setDescription(`Total tracker aktif: **${trackedChannels.length}**`)
    .addFields(
      ...visibleEntries.map((item, index) => ({
        name: `${index + 1}. ${truncateText(item.youtube.title || item.youtube.username)}`,
        value: [
          `Handle: \`${item.youtube.username}\` | ID: \`${item.youtube.channelId}\``,
          `Target: <#${item.discord.channelId}>${item.discord.roleId ? ` | Ping: <@&${item.discord.roleId}>` : ""}`,
          `Filter: \`${getContentFilterLabel(item.notifications?.contentFilter)}\` | Layout: \`${item.notifications?.embedLayout || "compact"}\``,
          `Judul: \`${getTitleFilterLabel(item.notifications?.titleFilters ?? item.notifications?.titleFilter)}\``,
          `Custom: \`${item.notifications?.customMessage ? "Aktif" : "Default"}\` | Last Video: \`${item.lastVideoId || "-"}\``
        ].join("\n"),
        inline: false
      })),
      ...(hiddenCount
        ? [{
            name: "Sisa Data",
            value: `${hiddenCount} tracker lainnya tidak ditampilkan agar embed tetap ringkas.`,
            inline: false
          }]
        : [])
    )
    .setFooter({ text: `Prefix saat ini: ${guildPrefix}` })
    .setTimestamp();
}

function normalizeChannelTitleForCompare(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s*-\s*topic\s*$/i, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function areChannelTitlesLikelySame(left, right) {
  const normalizedLeft = normalizeChannelTitleForCompare(left);
  const normalizedRight = normalizeChannelTitleForCompare(right);

  if (!normalizedLeft || !normalizedRight) {
    return true;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  if (normalizedLeft.length >= 6 && normalizedRight.includes(normalizedLeft)) {
    return true;
  }

  if (normalizedRight.length >= 6 && normalizedLeft.includes(normalizedRight)) {
    return true;
  }

  return false;
}

function assertHandleResolutionConsistency(youtubeInfo, latestVideo) {
  if (!youtubeInfo?.username?.startsWith("@")) {
    return;
  }

  const scrapedTitle = youtubeInfo?.title || null;
  const rssTitle = latestVideo?.channelTitle || null;

  if (!scrapedTitle || !rssTitle) {
    return;
  }

  if (areChannelTitlesLikelySame(scrapedTitle, rssTitle)) {
    return;
  }

  throw new TrackerValidationError(
    `Deteksi mismatch handle ${youtubeInfo.username}. ` +
    `Scrape title "${scrapedTitle}" tetapi RSS title "${rssTitle}" pada channelId ${youtubeInfo.channelId}. ` +
    "Operasi dibatalkan untuk mencegah tracker salah channel. Gunakan channel ID langsung atau update handle yang benar."
  );
}

module.exports = {
  addChannelTracker,
  buildTrackedChannelsEmbed,
  listTrackedChannels,
  removeChannelTracker,
  updateChannelTracker,
  __private: {
    areChannelTitlesLikelySame,
    assertHandleResolutionConsistency,
    ensureSourceRefreshAllowed
  }
};
