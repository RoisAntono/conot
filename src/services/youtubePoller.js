const {
  NOTIFICATION_HISTORY_WINDOW_MS,
  NOTIFICATION_GUARD_WINDOW_MS,
  POLL_INTERVAL_MS,
  RSS_FAILURE_LOG_REPEAT_EVERY,
  RSS_FAILURE_LOG_THRESHOLD,
  RSS_RECENT_VIDEOS_LIMIT,
  TITLE_WATCH_SEARCH_LIMIT
} = require("../config/constants");
const accessGuardService = require("./accessGuardService");
const fileDb = require("../utils/fileDb");
const discordDeliveryDiagnostics = require("../utils/discordDeliveryDiagnostics");
const titleWatchFormatter = require("../utils/titleWatchFormatter");
const youtubeVideoInspector = require("../utils/youtubeVideoInspector");
const botLogService = require("./botLogService");
const rssChecker = require("../utils/rssChecker");
const networkRetry = require("../utils/networkRetry");
const logger = require("../utils/logger");
const videoAge = require("../utils/videoAge");
const youtubeSearchScraper = require("../utils/youtubeSearchScraper");

let poller = null;
let initialRunTimeout = null;
let isRunning = false;
let pollerStartedAt = null;
let lastCycleStartedAt = null;
let lastCycleFinishedAt = null;
let lastCycleStatus = "idle";
let lastCycleError = null;
let cycleCount = 0;
let lastCycleTrackedCount = 0;
let lastCycleGuildCount = 0;
const rssFailureState = new Map();
const recentNotificationHistory = new Map();
const TRACKER_SEEN_VIDEO_HISTORY_LIMIT = 25;

const baseRuntimeDeps = {
  classifyNetworkError: networkRetry.classifyNetworkError,
  diagnoseChannelAccess: discordDeliveryDiagnostics.diagnoseChannelAccess,
  diagnoseDiscordSendError: discordDeliveryDiagnostics.diagnoseDiscordSendError,
  fetchRecentVideos: rssChecker.fetchRecentVideos,
  formatNotificationMessage: rssChecker.formatNotificationMessage,
  formatStatusTransitionMessage: rssChecker.formatStatusTransitionMessage,
  formatTitleWatchNotification: titleWatchFormatter.formatTitleWatchNotification,
  getAccessControl: accessGuardService.getAccessControl,
  getAllTrackedChannels: fileDb.getAllTrackedChannels,
  getTitleWatchesByGuild: fileDb.getTitleWatchesByGuild,
  getVideoTimestampMs: videoAge.getVideoTimestampMs,
  hasResolvableVideoTimestamp: videoAge.hasResolvableVideoTimestamp,
  inspectYouTubeLiveHandle: youtubeVideoInspector.inspectYouTubeLiveHandle,
  inspectYouTubeVideo: youtubeVideoInspector.inspectYouTubeVideo,
  isGuildAuthorizedByControl: accessGuardService.isGuildAuthorizedByControl,
  isVideoWithinMaxAgeDays: videoAge.isVideoWithinMaxAgeDays,
  mergeInspectedVideo: youtubeVideoInspector.mergeInspectedVideo,
  searchYouTubeVideos: youtubeSearchScraper.searchYouTubeVideos,
  sendGuildLog: botLogService.sendGuildLog,
  shouldNotifyForVideo: rssChecker.shouldNotifyForVideo,
  updateLastVideoState: fileDb.updateLastVideoState,
  updateTitleWatchLastVideo: fileDb.updateTitleWatchLastVideo,
  updateTitleWatchNotificationState: fileDb.updateTitleWatchNotificationState
};
const runtimeDeps = { ...baseRuntimeDeps };

const TRANSITION_SOURCE_STATES = new Set([
  "live",
  "members_live",
  "upcoming",
  "members_upcoming",
  "premiere_upcoming",
  "members_premiere_upcoming"
]);

const FOLLOW_UP_TARGET_STATES = new Set([
  "replay_stream",
  "members_replay_stream",
  "premiere_video",
  "members_premiere_video",
  "uploaded",
  "members_video"
]);

async function enrichLatestVideo(trackedChannel, latestVideo) {
  try {
    const inspectedVideo = await runtimeDeps.inspectYouTubeVideo(latestVideo.videoId, latestVideo);
    return runtimeDeps.mergeInspectedVideo(latestVideo, inspectedVideo);
  } catch (error) {
    logger.warn(`Gagal menginspeksi status watch page untuk video ${latestVideo.videoId}. Fallback ke metadata RSS.`, error);

    try {
      const liveHandleVideo = await runtimeDeps.inspectYouTubeLiveHandle(
        trackedChannel.youtube.username,
        latestVideo.videoId,
        latestVideo
      );
      return runtimeDeps.mergeInspectedVideo(latestVideo, liveHandleVideo);
    } catch (liveError) {
      logger.warn(
        `Gagal menginspeksi halaman live handle untuk ${trackedChannel.youtube.username || trackedChannel.youtube.channelId}.`,
        liveError
      );
      return runtimeDeps.mergeInspectedVideo(latestVideo, null);
    }
  }
}

async function enrichGlobalSearchVideo(searchVideo) {
  try {
    const inspectedVideo = await runtimeDeps.inspectYouTubeVideo(searchVideo.videoId, searchVideo);
    return runtimeDeps.mergeInspectedVideo(searchVideo, inspectedVideo);
  } catch (error) {
    logger.warn(`Gagal menginspeksi hasil search untuk video ${searchVideo.videoId}. Fallback ke metadata search.`, error);
    return runtimeDeps.mergeInspectedVideo(searchVideo, null);
  }
}

function getSeenTitleWatchVideoIds(watch) {
  return new Set([
    watch.lastVideoId,
    ...(Array.isArray(watch.recentVideoIds) ? watch.recentVideoIds : [])
  ].filter(Boolean));
}

function pickNextTitleWatchResult(watch, searchResults) {
  const seenVideoIds = getSeenTitleWatchVideoIds(watch);
  return searchResults.find((video) => !seenVideoIds.has(video.videoId)) || null;
}

function hasTitleWatchHistory(watch) {
  return Array.isArray(watch.recentVideoIds) && watch.recentVideoIds.length > 1;
}

function isWithinTitleWatchMaxAge(watch, video) {
  return runtimeDeps.isVideoWithinMaxAgeDays(video, watch?.maxAgeDays);
}

function isHistoricalTitleWatchResult(watch, video) {
  const videoTime = runtimeDeps.getVideoTimestampMs(video);
  const watchTime = new Date(watch?.configuredAt || watch?.createdAt || 0).getTime();

  if (!videoTime || !watchTime) {
    return false;
  }

  return videoTime <= watchTime;
}

function hasResolvableTitleWatchTimestamp(video) {
  return runtimeDeps.hasResolvableVideoTimestamp(video);
}

function getNetworkClassificationLabel(classification) {
  return classification?.isTransient ? "Transient" : "Permanent";
}

function getNetworkRecoverySuggestion(classification) {
  if (classification?.isTransient) {
    return "Gangguan bersifat sementara (DNS/timeout/rate-limit/server). Bot sudah retry otomatis. Coba tunggu siklus berikutnya.";
  }

  if (classification?.status === 404) {
    return "YouTube mengembalikan 404. Cek kembali channel ID/handle tracker. Jika handle berubah, jalankan update dengan `--refresh-source`.";
  }

  return "Periksa channel ID/handle, koneksi server, dan pastikan endpoint YouTube bisa diakses. Jika perlu, update tracker ke sumber yang valid.";
}

function buildNetworkLogDetails(error) {
  const classification = runtimeDeps.classifyNetworkError(error);
  return {
    classification,
    details: [
      {
        name: "Tipe Error",
        value: getNetworkClassificationLabel(classification),
        inline: true
      },
      {
        name: "Code",
        value: `\`${classification?.code || "-"}\``,
        inline: true
      },
      {
        name: "HTTP Status",
        value: `\`${classification?.status || "-"}\``,
        inline: true
      },
      {
        name: "Solusi",
        value: getNetworkRecoverySuggestion(classification),
        inline: false
      }
    ]
  };
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildRssFailureKey(trackedChannel) {
  return [
    trackedChannel?.discord?.guildId || "unknown-guild",
    trackedChannel?.youtube?.channelId || "unknown-channel"
  ].join(":");
}

function rememberRssFailure(trackedChannel, error) {
  const key = buildRssFailureKey(trackedChannel);
  const previous = rssFailureState.get(key) || {
    count: 0,
    lastError: null,
    lastFailedAt: null
  };
  const next = {
    count: previous.count + 1,
    lastError: error?.message || String(error),
    lastFailedAt: new Date().toISOString()
  };
  rssFailureState.set(key, next);
  return next;
}

function clearRssFailure(trackedChannel) {
  rssFailureState.delete(buildRssFailureKey(trackedChannel));
}

function shouldEmitRssFailureLog(failureCount) {
  const threshold = normalizePositiveInteger(RSS_FAILURE_LOG_THRESHOLD, 3);
  const repeatEvery = normalizePositiveInteger(RSS_FAILURE_LOG_REPEAT_EVERY, 6);

  if (failureCount < threshold) {
    return false;
  }

  if (failureCount === threshold) {
    return true;
  }

  return ((failureCount - threshold) % repeatEvery) === 0;
}

function pruneRecentNotificationHistory() {
  const now = Date.now();
  const maxAgeMs = normalizePositiveInteger(NOTIFICATION_HISTORY_WINDOW_MS, 24 * 60 * 60 * 1000);

  for (const [trackerKey, signatures] of recentNotificationHistory.entries()) {
    for (const [signature, timestamp] of signatures.entries()) {
      if ((now - timestamp) >= maxAgeMs) {
        signatures.delete(signature);
      }
    }

    if (!signatures.size) {
      recentNotificationHistory.delete(trackerKey);
    }
  }
}

function buildRecentHistoryKey(entryType, entry) {
  if (entryType === "tracker") {
    return `tracker:${entry?.discord?.guildId || "unknown"}:${entry?.youtube?.channelId || "unknown"}`;
  }

  return `titlewatch:${entry?.channelId || "unknown"}:${String(entry?.keyword || "").trim().toLowerCase()}`;
}

function shouldSkipByRecentHistory(entryType, entry, signature) {
  pruneRecentNotificationHistory();
  const trackerKey = buildRecentHistoryKey(entryType, entry);
  const signatures = recentNotificationHistory.get(trackerKey);
  if (!signatures) {
    return false;
  }

  return signatures.has(signature);
}

function rememberRecentHistory(entryType, entry, signature) {
  pruneRecentNotificationHistory();
  const trackerKey = buildRecentHistoryKey(entryType, entry);
  const signatures = recentNotificationHistory.get(trackerKey) || new Map();
  signatures.set(signature, Date.now());
  recentNotificationHistory.set(trackerKey, signatures);
}

function shouldSkipByAttemptGuard(entry, signature) {
  if (!entry?.lastDeliveryAttemptSignature || !entry?.lastDeliveryAttemptAt) {
    return false;
  }

  if (entry.lastDeliveryAttemptSignature !== signature) {
    return false;
  }

  const attemptedAt = new Date(entry.lastDeliveryAttemptAt).getTime();
  if (!attemptedAt) {
    return false;
  }

  const guardWindowMs = normalizePositiveInteger(NOTIFICATION_GUARD_WINDOW_MS, 30 * 60 * 1000);
  return (Date.now() - attemptedAt) < guardWindowMs;
}

function shouldSkipBySuccessGuard(entry, signature) {
  return Boolean(entry?.lastNotificationSignature && entry.lastNotificationSignature === signature);
}

function shouldSkipNotificationByGuards(entryType, entry, signature) {
  if (shouldSkipBySuccessGuard(entry, signature)) {
    return { skip: true, reason: "success_guard" };
  }

  if (shouldSkipByAttemptGuard(entry, signature)) {
    return { skip: true, reason: "attempt_guard" };
  }

  if (shouldSkipByRecentHistory(entryType, entry, signature)) {
    return { skip: true, reason: "recent_history_guard" };
  }

  return { skip: false, reason: null };
}

function buildTrackerNotificationSignature(trackedChannel, latestVideo, kind = "new") {
  return [
    kind,
    latestVideo.videoId,
    latestVideo.contentState || "unknown",
    trackedChannel?.discord?.channelId || "unknown",
    trackedChannel?.discord?.roleId || "none"
  ].join(":");
}

function buildTitleWatchNotificationSignature(watch, latestVideo) {
  return [
    "titlewatch",
    String(watch.keyword || "").trim().toLowerCase(),
    latestVideo.videoId,
    latestVideo.contentState || "unknown",
    watch?.channelId || "unknown",
    watch?.roleId || "none"
  ].join(":");
}

async function processGlobalTitleWatchesForGuild(client, guildId) {
  const titleWatches = await runtimeDeps.getTitleWatchesByGuild(guildId);

  if (!titleWatches.length) {
    return;
  }

  for (const watch of titleWatches) {
    let searchResults = [];

    try {
      searchResults = await runtimeDeps.searchYouTubeVideos(watch.keyword, TITLE_WATCH_SEARCH_LIMIT);
    } catch (error) {
      const networkMeta = buildNetworkLogDetails(error);
      logger.warn(`Gagal mencari hasil YouTube untuk title watch "${watch.keyword}".`, error);
      await runtimeDeps.sendGuildLog(client, {
        guildId,
        level: "warn",
        scope: "Title Watch",
        title: `Pencarian title watch gagal`,
        description: `Bot gagal mengambil hasil pencarian YouTube untuk keyword \`${watch.keyword}\`.`,
        logSignature: `titlewatch-search-failed:${String(watch.keyword || "").trim().toLowerCase()}`,
        details: [
          {
            name: "Keyword",
            value: `\`${watch.keyword}\``,
            inline: true
          },
          ...networkMeta.details
        ],
        error
      });
      continue;
    }

    const recentSearchResults = searchResults.filter((video) => isWithinTitleWatchMaxAge(watch, video));

    if (!recentSearchResults.length) {
      continue;
    }

    if (!hasTitleWatchHistory(watch)) {
      await runtimeDeps.updateTitleWatchLastVideo(
        guildId,
        watch.keyword,
        recentSearchResults[0].videoId,
        recentSearchResults.map((video) => video.videoId)
      );
      continue;
    }

    const nextResult = pickNextTitleWatchResult(watch, recentSearchResults);
    if (!nextResult) {
      continue;
    }

    if (isHistoricalTitleWatchResult(watch, nextResult)) {
      await runtimeDeps.updateTitleWatchLastVideo(
        guildId,
        watch.keyword,
        watch.lastVideoId || recentSearchResults[0].videoId,
        recentSearchResults.map((video) => video.videoId)
      );
      continue;
    }

    const latestVideo = await enrichGlobalSearchVideo(nextResult);

    if (!hasResolvableTitleWatchTimestamp(latestVideo)) {
      logger.info(
        `Title watch "${watch.keyword}" melewati video ${latestVideo.videoId} karena waktu publish/live tidak bisa diverifikasi.`
      );

      await runtimeDeps.updateTitleWatchLastVideo(
        guildId,
        watch.keyword,
        watch.lastVideoId || recentSearchResults[0].videoId,
        [latestVideo.videoId, ...recentSearchResults.map((video) => video.videoId)]
      );
      continue;
    }

    if (!isWithinTitleWatchMaxAge(watch, latestVideo)) {
      logger.info(
        `Title watch "${watch.keyword}" melewati video ${latestVideo.videoId} karena melebihi batas ${watch.maxAgeDays} hari.`
      );

      await runtimeDeps.updateTitleWatchLastVideo(
        guildId,
        watch.keyword,
        watch.lastVideoId || recentSearchResults[0].videoId,
        [latestVideo.videoId, ...recentSearchResults.map((video) => video.videoId)]
      );
      continue;
    }

    if (isHistoricalTitleWatchResult(watch, latestVideo)) {
      logger.info(
        `Title watch "${watch.keyword}" melewati video ${latestVideo.videoId} karena lebih lama dari waktu konfigurasi watch.`
      );

      await runtimeDeps.updateTitleWatchLastVideo(
        guildId,
        watch.keyword,
        watch.lastVideoId || recentSearchResults[0].videoId,
        [latestVideo.videoId, ...recentSearchResults.map((video) => video.videoId)]
      );
      continue;
    }

    const trackedChannel = {
      youtube: {
        username: latestVideo.channelHandle || latestVideo.channelTitle,
        title: latestVideo.channelTitle
      },
      notifications: {
        embedLayout: "compact"
      }
    };
    const notificationSignature = buildTitleWatchNotificationSignature(watch, latestVideo);

    const guardState = shouldSkipNotificationByGuards("titlewatch", watch, notificationSignature);
    if (guardState.skip) {
      logger.info(
        `Title watch "${watch.keyword}" dilewati oleh guard (${guardState.reason}) ` +
        `karena signature ${notificationSignature} sudah pernah dicoba/dikirim baru-baru ini.`
      );
      continue;
    }

    let titleWatchFetchError = null;
    const discordChannel = await client.channels.fetch(watch.channelId).catch((error) => {
      titleWatchFetchError = error;
      logger.warn(`Gagal mengambil title watch channel Discord ${watch.channelId}.`, error);
      return null;
    });

    if (!discordChannel?.isTextBased()) {
      logger.warn(`Title watch channel Discord ${watch.channelId} tidak ditemukan atau bukan text channel.`);
      const diagnosis = titleWatchFetchError
        ? runtimeDeps.diagnoseDiscordSendError({
            channel: null,
            clientUser: client.user,
            error: titleWatchFetchError,
            roleId: watch.roleId || null
          })
        : runtimeDeps.diagnoseChannelAccess(null, client.user);
      await runtimeDeps.sendGuildLog(client, {
        guildId,
        level: "warn",
        scope: "Title Watch",
        title: "Channel title watch tidak valid",
        description: diagnosis.cause,
        logSignature: `titlewatch-invalid-channel:${String(watch.keyword || "").trim().toLowerCase()}:${watch.channelId}`,
        details: [
          {
            name: "Keyword",
            value: `\`${watch.keyword}\``,
            inline: true
          },
          {
            name: "Channel ID",
            value: `\`${watch.channelId}\``,
            inline: true
          },
          {
            name: "Solusi",
            value: diagnosis.solution,
            inline: false
          }
        ]
      });
      await runtimeDeps.updateTitleWatchNotificationState(guildId, watch.keyword, {
        lastDeliveryAttemptSignature: notificationSignature,
        lastDeliveryAttemptAt: new Date().toISOString()
      });
      continue;
    }

    const preflightAccess = runtimeDeps.diagnoseChannelAccess(discordChannel, client.user);
    if (!preflightAccess.ok && preflightAccess.missingPermissions?.length) {
      await runtimeDeps.sendGuildLog(client, {
        guildId,
        level: "warn",
        scope: "Title Watch",
        title: "Notifikasi title watch dibatalkan: permission channel kurang",
        description: preflightAccess.cause,
        logSignature: `titlewatch-preflight-permission:${String(watch.keyword || "").trim().toLowerCase()}:${watch.channelId}`,
        details: [
          {
            name: "Keyword",
            value: `\`${watch.keyword}\``,
            inline: true
          },
          {
            name: "Target Channel",
            value: `<#${watch.channelId}>`,
            inline: true
          },
          ...preflightAccess.details,
          {
            name: "Solusi",
            value: preflightAccess.solution,
            inline: false
          }
        ]
      });
      await runtimeDeps.updateTitleWatchNotificationState(guildId, watch.keyword, {
        lastDeliveryAttemptSignature: notificationSignature,
        lastDeliveryAttemptAt: new Date().toISOString()
      });
      continue;
    }

    try {
      await discordChannel.send(runtimeDeps.formatTitleWatchNotification(watch, trackedChannel, latestVideo));
      rememberRecentHistory("titlewatch", watch, notificationSignature);
      await runtimeDeps.updateTitleWatchNotificationState(guildId, watch.keyword, {
        lastNotificationSignature: notificationSignature,
        lastNotificationAt: new Date().toISOString(),
        lastDeliveryAttemptSignature: notificationSignature,
        lastDeliveryAttemptAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`Gagal mengirim title watch notification ke channel ${watch.channelId}.`, error);
      const diagnosis = runtimeDeps.diagnoseDiscordSendError({
        channel: discordChannel,
        clientUser: client.user,
        error,
        roleId: watch.roleId || null
      });
      await runtimeDeps.sendGuildLog(client, {
        guildId,
        level: "error",
        scope: "Title Watch",
        title: "Notifikasi title watch gagal dikirim",
        description: diagnosis.cause,
        logSignature: `titlewatch-send-failed:${notificationSignature}`,
        details: [
          {
            name: "Keyword",
            value: `\`${watch.keyword}\``,
            inline: true
          },
          {
            name: "Target Channel",
            value: `<#${watch.channelId}>`,
            inline: true
          },
          {
            name: "Video",
            value: latestVideo.link,
            inline: false
          },
          ...diagnosis.details,
          {
            name: "Solusi",
            value: diagnosis.solution,
            inline: false
          }
        ],
        error
      });
      await runtimeDeps.updateTitleWatchNotificationState(guildId, watch.keyword, {
        lastDeliveryAttemptSignature: notificationSignature,
        lastDeliveryAttemptAt: new Date().toISOString()
      });
      continue;
    }

    await runtimeDeps.updateTitleWatchLastVideo(
      guildId,
      watch.keyword,
      latestVideo.videoId,
      recentSearchResults.map((video) => video.videoId)
    );
  }
}

function shouldInspectExistingVideo(trackedChannel) {
  return TRANSITION_SOURCE_STATES.has(trackedChannel.lastContentState);
}

function shouldSendStatusFollowUp(trackedChannel, latestVideo) {
  const previousNotifiedVideoId = trackedChannel.lastNotifiedVideoId || null;
  const previousNotifiedState = trackedChannel.lastNotifiedContentState || null;
  const currentState = latestVideo.contentState || null;

  return (
    previousNotifiedVideoId === latestVideo.videoId &&
    TRANSITION_SOURCE_STATES.has(previousNotifiedState) &&
    FOLLOW_UP_TARGET_STATES.has(currentState) &&
    previousNotifiedState !== currentState
  );
}

function getSeenTrackerVideoIds(trackedChannel) {
  return new Set([
    trackedChannel?.lastVideoId,
    ...(Array.isArray(trackedChannel?.recentSeenVideoIds) ? trackedChannel.recentSeenVideoIds : [])
  ].filter(Boolean));
}

function normalizeTrackerSeenIds(existingIds, incomingIds = [], latestVideoId = null) {
  const values = [
    ...(Array.isArray(incomingIds) ? incomingIds : [incomingIds]),
    ...(Array.isArray(existingIds) ? existingIds : [])
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (latestVideoId) {
    values.unshift(String(latestVideoId).trim());
  }

  return [...new Set(values)].slice(0, TRACKER_SEEN_VIDEO_HISTORY_LIMIT);
}

function pickTrackerNewVideoCandidates(trackedChannel, recentVideos) {
  const videos = Array.isArray(recentVideos) ? recentVideos.filter((item) => item?.videoId) : [];
  if (!videos.length) {
    return { candidates: [], hasBoundary: false };
  }

  const seenVideoIds = getSeenTrackerVideoIds(trackedChannel);
  const boundaryIndex = videos.findIndex((video) => seenVideoIds.has(video.videoId));

  if (boundaryIndex >= 0) {
    return {
      candidates: videos.slice(0, boundaryIndex),
      hasBoundary: true
    };
  }

  return {
    candidates: videos,
    hasBoundary: false
  };
}

async function sendTrackerNotification(client, trackedChannel, latestVideo, formatter) {
  const notificationKind = formatter === runtimeDeps.formatStatusTransitionMessage ? "followup" : "new";
  const notificationSignature = buildTrackerNotificationSignature(trackedChannel, latestVideo, notificationKind);

  const guardState = shouldSkipNotificationByGuards("tracker", trackedChannel, notificationSignature);
  if (guardState.skip) {
    logger.info(
      `Tracker ${trackedChannel.youtube.username || trackedChannel.youtube.channelId} dilewati oleh guard (${guardState.reason}) ` +
      `karena signature ${notificationSignature} sudah pernah dicoba/dikirim baru-baru ini.`
    );
    return false;
  }

  let trackerFetchError = null;
  const discordChannel = await client.channels.fetch(trackedChannel.discord.channelId).catch((error) => {
    trackerFetchError = error;
    logger.warn(`Gagal mengambil channel Discord ${trackedChannel.discord.channelId}.`, error);
    return null;
  });

  if (!discordChannel?.isTextBased()) {
    logger.warn(`Channel Discord ${trackedChannel.discord.channelId} tidak ditemukan atau bukan text channel.`);
    const diagnosis = trackerFetchError
      ? runtimeDeps.diagnoseDiscordSendError({
          channel: null,
          clientUser: client.user,
          error: trackerFetchError,
          roleId: trackedChannel.discord.roleId || null
        })
      : runtimeDeps.diagnoseChannelAccess(null, client.user);
    await runtimeDeps.sendGuildLog(client, {
      guildId: trackedChannel.discord.guildId,
      level: "warn",
      scope: "Tracker",
      title: "Channel tracker tidak valid",
      description: diagnosis.cause,
      logSignature: `tracker-invalid-channel:${trackedChannel.youtube.channelId}:${trackedChannel.discord.channelId}`,
      details: [
        {
          name: "YouTube",
          value: trackedChannel.youtube.title || trackedChannel.youtube.username || trackedChannel.youtube.channelId,
          inline: true
        },
        {
          name: "Channel ID",
          value: `\`${trackedChannel.discord.channelId}\``,
          inline: true
        },
        {
          name: "Solusi",
          value: diagnosis.solution,
          inline: false
        }
      ]
    });
    await runtimeDeps.updateLastVideoState(
      trackedChannel.discord.guildId,
      trackedChannel.youtube.channelId,
      latestVideo,
      {
        lastDeliveryAttemptSignature: notificationSignature,
        lastDeliveryAttemptAt: new Date().toISOString()
      }
    );
    return false;
  }

  const preflightAccess = runtimeDeps.diagnoseChannelAccess(discordChannel, client.user);
  if (!preflightAccess.ok && preflightAccess.missingPermissions?.length) {
    await runtimeDeps.sendGuildLog(client, {
      guildId: trackedChannel.discord.guildId,
      level: "warn",
      scope: "Tracker",
      title: "Notifikasi dibatalkan: permission channel kurang",
      description: preflightAccess.cause,
      logSignature: `tracker-preflight-permission:${trackedChannel.youtube.channelId}:${trackedChannel.discord.channelId}`,
      details: [
        {
          name: "YouTube",
          value: trackedChannel.youtube.title || trackedChannel.youtube.username || trackedChannel.youtube.channelId,
          inline: true
        },
        {
          name: "Target Channel",
          value: `<#${trackedChannel.discord.channelId}>`,
          inline: true
        },
        ...preflightAccess.details,
        {
          name: "Solusi",
          value: preflightAccess.solution,
          inline: false
        }
      ]
    });
    await runtimeDeps.updateLastVideoState(
      trackedChannel.discord.guildId,
      trackedChannel.youtube.channelId,
      latestVideo,
      {
        lastDeliveryAttemptSignature: notificationSignature,
        lastDeliveryAttemptAt: new Date().toISOString()
      }
    );
    return false;
  }

  try {
    await discordChannel.send(formatter(trackedChannel, latestVideo));
    rememberRecentHistory("tracker", trackedChannel, notificationSignature);
    await runtimeDeps.updateLastVideoState(
      trackedChannel.discord.guildId,
      trackedChannel.youtube.channelId,
      latestVideo,
      {
        lastNotificationSignature: notificationSignature,
        lastNotificationAt: new Date().toISOString(),
        lastDeliveryAttemptSignature: notificationSignature,
        lastDeliveryAttemptAt: new Date().toISOString()
      }
    );
    return true;
  } catch (error) {
    logger.error(`Gagal mengirim notifikasi ke channel ${trackedChannel.discord.channelId}.`, error);
    const diagnosis = runtimeDeps.diagnoseDiscordSendError({
      channel: discordChannel,
      clientUser: client.user,
      error,
      roleId: trackedChannel.discord.roleId || null
    });
    await runtimeDeps.sendGuildLog(client, {
      guildId: trackedChannel.discord.guildId,
      level: "error",
      scope: "Tracker",
      title: "Notifikasi tracker gagal dikirim",
      description: diagnosis.cause,
      logSignature: `tracker-send-failed:${notificationSignature}`,
      details: [
        {
          name: "YouTube",
          value: trackedChannel.youtube.title || trackedChannel.youtube.username || trackedChannel.youtube.channelId,
          inline: true
        },
        {
          name: "Target Channel",
          value: `<#${trackedChannel.discord.channelId}>`,
          inline: true
        },
        {
          name: "Video",
          value: latestVideo.link,
          inline: false
        },
        ...diagnosis.details,
        {
          name: "Solusi",
          value: diagnosis.solution,
          inline: false
        }
      ],
      error
    });
    await runtimeDeps.updateLastVideoState(
      trackedChannel.discord.guildId,
      trackedChannel.youtube.channelId,
      latestVideo,
      {
        lastDeliveryAttemptSignature: notificationSignature,
        lastDeliveryAttemptAt: new Date().toISOString()
      }
    );
    return false;
  }
}

async function processTrackedChannel(client, trackedChannel) {
  let recentVideos;

  try {
    recentVideos = await runtimeDeps.fetchRecentVideos(trackedChannel.youtube.channelId, RSS_RECENT_VIDEOS_LIMIT);
  } catch (error) {
    const failure = rememberRssFailure(trackedChannel, error);
    const networkMeta = buildNetworkLogDetails(error);
    logger.warn(`RSS gagal dimuat untuk ${trackedChannel.youtube.username || trackedChannel.youtube.channelId}.`, error);

    if (!shouldEmitRssFailureLog(failure.count)) {
      logger.info(
        `RSS error untuk ${trackedChannel.youtube.username || trackedChannel.youtube.channelId} ` +
        `ditahan oleh threshold log (${failure.count}x berturut).`
      );
      return;
    }

    await runtimeDeps.sendGuildLog(client, {
      guildId: trackedChannel.discord.guildId,
      level: "warn",
      scope: "RSS",
      title: "RSS YouTube gagal dimuat",
      description: "Bot gagal mengambil RSS feed untuk tracker YouTube.",
      logSignature: `rss-fetch-failed:${trackedChannel.youtube.channelId}:${networkMeta.classification?.status || networkMeta.classification?.code || "unknown"}`,
      details: [
        {
          name: "YouTube",
          value: trackedChannel.youtube.title || trackedChannel.youtube.username || trackedChannel.youtube.channelId,
          inline: true
        },
        {
          name: "Channel ID",
          value: `\`${trackedChannel.youtube.channelId}\``,
          inline: true
        },
        {
          name: "Consecutive Failure",
          value: `\`${failure.count}x\``,
          inline: true
        },
        ...networkMeta.details
      ],
      error
    });
    return;
  }

  clearRssFailure(trackedChannel);

  const latestVideoFromFeed = recentVideos?.[0] || null;
  if (!latestVideoFromFeed) {
    return;
  }

  const feedVideoIds = recentVideos.map((video) => video.videoId).filter(Boolean);
  const recentSeenVideoIds = normalizeTrackerSeenIds(
    trackedChannel.recentSeenVideoIds,
    feedVideoIds,
    latestVideoFromFeed.videoId
  );

  let latestVideo = latestVideoFromFeed;

  if (!latestVideo) {
    return;
  }

  if (!trackedChannel.lastVideoId) {
    latestVideo = await enrichLatestVideo(trackedChannel, latestVideo);
    await runtimeDeps.updateLastVideoState(
      trackedChannel.discord.guildId,
      trackedChannel.youtube.channelId,
      latestVideo,
      {
        observedContentState: latestVideo.contentState || null,
        lastNotifiedVideoId: null,
        lastNotifiedContentState: null,
        recentSeenVideoIds
      }
    );
    return;
  }

  if (trackedChannel.lastVideoId === latestVideoFromFeed.videoId) {
    if (!shouldInspectExistingVideo(trackedChannel)) {
      await runtimeDeps.updateLastVideoState(
        trackedChannel.discord.guildId,
        trackedChannel.youtube.channelId,
        latestVideoFromFeed,
        {
          observedContentState: trackedChannel.lastContentState || null,
          lastNotifiedVideoId: trackedChannel.lastNotifiedVideoId || null,
          lastNotifiedContentState: trackedChannel.lastNotifiedContentState || null,
          recentSeenVideoIds
        }
      );
      return;
    }

    latestVideo = await enrichLatestVideo(trackedChannel, latestVideoFromFeed);
    const shouldNotify = runtimeDeps.shouldNotifyForVideo(trackedChannel, latestVideo);
    const shouldSendFollowUp = shouldNotify && shouldSendStatusFollowUp(trackedChannel, latestVideo);

    if (shouldSendFollowUp) {
      const sent = await sendTrackerNotification(client, trackedChannel, latestVideo, runtimeDeps.formatStatusTransitionMessage);

      await runtimeDeps.updateLastVideoState(
        trackedChannel.discord.guildId,
        trackedChannel.youtube.channelId,
        latestVideo,
        {
          observedContentState: latestVideo.contentState || null,
          lastNotifiedVideoId: sent ? latestVideo.videoId : trackedChannel.lastNotifiedVideoId || null,
          lastNotifiedContentState: sent ? latestVideo.contentState || null : trackedChannel.lastNotifiedContentState || null,
          recentSeenVideoIds
        }
      );
      return;
    }

    await runtimeDeps.updateLastVideoState(
      trackedChannel.discord.guildId,
      trackedChannel.youtube.channelId,
      latestVideo,
      {
        observedContentState: latestVideo.contentState || null,
        lastNotifiedVideoId: trackedChannel.lastNotifiedVideoId || null,
        lastNotifiedContentState: trackedChannel.lastNotifiedContentState || null,
        recentSeenVideoIds
      }
    );
    return;
  }

  const candidateWindow = pickTrackerNewVideoCandidates(trackedChannel, recentVideos);

  if (!candidateWindow.hasBoundary && trackedChannel.lastVideoId) {
    logger.warn(
      `Tracker ${trackedChannel.youtube.username || trackedChannel.youtube.channelId} tidak menemukan boundary video lama dalam ${RSS_RECENT_VIDEOS_LIMIT} item RSS terbaru. ` +
      "Ada kemungkinan sebagian video terlewat di luar window ini."
    );
  }

  if (!candidateWindow.candidates.length) {
    latestVideo = await enrichLatestVideo(trackedChannel, latestVideoFromFeed);
    await runtimeDeps.updateLastVideoState(
      trackedChannel.discord.guildId,
      trackedChannel.youtube.channelId,
      latestVideo,
      {
        observedContentState: latestVideo.contentState || null,
        lastNotifiedVideoId: null,
        lastNotifiedContentState: null,
        recentSeenVideoIds
      }
    );
    return;
  }

  let latestEnrichedVideo = null;
  let latestVideoSent = false;

  for (const pendingVideo of [...candidateWindow.candidates].reverse()) {
    const enrichedPendingVideo = await enrichLatestVideo(trackedChannel, pendingVideo);
    if (pendingVideo.videoId === latestVideoFromFeed.videoId) {
      latestEnrichedVideo = enrichedPendingVideo;
    }

    const shouldNotify = runtimeDeps.shouldNotifyForVideo(trackedChannel, enrichedPendingVideo);

    if (!shouldNotify) {
      const titleFilters = trackedChannel.notifications?.titleFilters
        ?? trackedChannel.notifications?.titleFilter
        ?? [];
      const titleFilterLabel = titleFilters.length
        ? titleFilters.toString()
        : "all";

      logger.info(
        `Video ${enrichedPendingVideo.videoId} dilewati karena filter tracker untuk ${trackedChannel.youtube.username}. ` +
        `content=${trackedChannel.notifications?.contentFilter || "all"} ` +
        `title=${titleFilterLabel}`
      );
      continue;
    }

    const sent = await sendTrackerNotification(client, trackedChannel, enrichedPendingVideo, runtimeDeps.formatNotificationMessage);
    if (pendingVideo.videoId === latestVideoFromFeed.videoId) {
      latestVideoSent = sent;
    }
  }

  latestVideo = latestEnrichedVideo || await enrichLatestVideo(trackedChannel, latestVideoFromFeed);

  await runtimeDeps.updateLastVideoState(
    trackedChannel.discord.guildId,
    trackedChannel.youtube.channelId,
    latestVideo,
    {
      observedContentState: latestVideo.contentState || null,
      lastNotifiedVideoId: latestVideoSent ? latestVideo.videoId : null,
      lastNotifiedContentState: latestVideoSent ? latestVideo.contentState || null : null,
      recentSeenVideoIds
    }
  );
}

async function runPollCycle(client) {
  if (isRunning) {
    logger.warn("Polling sebelumnya masih berjalan. Siklus baru dilewati.");
    return;
  }

  isRunning = true;
  lastCycleStartedAt = new Date().toISOString();
  lastCycleStatus = "running";
  lastCycleError = null;

  try {
    const accessControl = await runtimeDeps.getAccessControl();
    const trackedChannels = await runtimeDeps.getAllTrackedChannels();
    lastCycleTrackedCount = trackedChannels.filter((trackedChannel) => {
      return runtimeDeps.isGuildAuthorizedByControl(accessControl, trackedChannel.discord?.guildId);
    }).length;
    lastCycleGuildCount = [...client.guilds.cache.values()].filter((guild) => {
      return runtimeDeps.isGuildAuthorizedByControl(accessControl, guild.id);
    }).length;

    for (const trackedChannel of trackedChannels) {
      if (!runtimeDeps.isGuildAuthorizedByControl(accessControl, trackedChannel.discord?.guildId)) {
        continue;
      }

      await processTrackedChannel(client, trackedChannel);
    }

    for (const guild of client.guilds.cache.values()) {
      if (!runtimeDeps.isGuildAuthorizedByControl(accessControl, guild.id)) {
        continue;
      }

      await processGlobalTitleWatchesForGuild(client, guild.id);
    }

    cycleCount += 1;
    lastCycleStatus = "success";
  } catch (error) {
    logger.error("Polling RSS gagal dijalankan.", error);
    lastCycleStatus = "error";
    lastCycleError = error?.message || String(error);
  } finally {
    lastCycleFinishedAt = new Date().toISOString();
    isRunning = false;
  }
}

function startYouTubePoller(client) {
  if (poller) {
    clearInterval(poller);
  }

  if (initialRunTimeout) {
    clearTimeout(initialRunTimeout);
    initialRunTimeout = null;
  }

  pollerStartedAt = new Date().toISOString();
  lastCycleStatus = "scheduled";
  lastCycleError = null;
  cycleCount = 0;
  lastCycleTrackedCount = 0;
  lastCycleGuildCount = 0;

  initialRunTimeout = setTimeout(() => {
    runPollCycle(client).catch((error) => logger.error("Polling awal gagal.", error));
  }, 5000);

  poller = setInterval(() => {
    runPollCycle(client).catch((error) => logger.error("Polling berkala gagal.", error));
  }, POLL_INTERVAL_MS);

  logger.info(`YouTube poller aktif. Interval ${POLL_INTERVAL_MS / 60000} menit.`);
}

function stopYouTubePoller() {
  if (initialRunTimeout) {
    clearTimeout(initialRunTimeout);
    initialRunTimeout = null;
  }

  if (poller) {
    clearInterval(poller);
    poller = null;
  }
}

function getPollerStatus() {
  return {
    active: Boolean(poller),
    isRunning,
    intervalMs: POLL_INTERVAL_MS,
    startedAt: pollerStartedAt,
    lastCycleStartedAt,
    lastCycleFinishedAt,
    lastCycleStatus,
    lastCycleError,
    cycleCount,
    lastCycleTrackedCount,
    lastCycleGuildCount
  };
}

function resetRuntimeGuardState() {
  rssFailureState.clear();
  recentNotificationHistory.clear();
}

function setRuntimeDeps(overrides = {}) {
  Object.assign(runtimeDeps, overrides || {});
}

function resetRuntimeDeps() {
  for (const key of Object.keys(runtimeDeps)) {
    if (!Object.prototype.hasOwnProperty.call(baseRuntimeDeps, key)) {
      delete runtimeDeps[key];
    }
  }

  Object.assign(runtimeDeps, baseRuntimeDeps);
}

function resetPollerRuntimeState() {
  stopYouTubePoller();
  isRunning = false;
  pollerStartedAt = null;
  lastCycleStartedAt = null;
  lastCycleFinishedAt = null;
  lastCycleStatus = "idle";
  lastCycleError = null;
  cycleCount = 0;
  lastCycleTrackedCount = 0;
  lastCycleGuildCount = 0;
  resetRuntimeGuardState();
  resetRuntimeDeps();
}

module.exports = {
  getPollerStatus,
  runPollCycle,
  startYouTubePoller,
  stopYouTubePoller,
  __private: {
    buildTitleWatchNotificationSignature,
    buildTrackerNotificationSignature,
    isWithinTitleWatchMaxAge,
    normalizeTrackerSeenIds,
    pickTrackerNewVideoCandidates,
    shouldEmitRssFailureLog,
    shouldSkipByAttemptGuard,
    shouldSkipBySuccessGuard,
    shouldSkipNotificationByGuards,
    shouldSendStatusFollowUp,
    shouldSkipByRecentHistory,
    rememberRecentHistory,
    resetPollerRuntimeState,
    resetRuntimeGuardState,
    setRuntimeDeps,
    resetRuntimeDeps
  }
};
