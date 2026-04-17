const test = require("node:test");
const assert = require("node:assert/strict");
const {
  __private,
  getPollerStatus,
  runPollCycle
} = require("../src/services/youtubePoller");

function createTrackedChannel(overrides = {}) {
  return {
    youtube: {
      username: "@windah",
      title: "Windah Basudara",
      channelId: "UCaaaaaaaaaaaaaaaaaaaaaa"
    },
    discord: {
      guildId: "guild-1",
      channelId: "discord-channel-1",
      roleId: null
    },
    notifications: {
      contentFilter: "all",
      titleFilters: []
    },
    lastVideoId: "old-video-id",
    recentSeenVideoIds: ["old-video-id"],
    lastContentState: "uploaded",
    lastNotifiedVideoId: null,
    lastNotifiedContentState: null,
    ...overrides
  };
}

function createLatestFeedVideo(overrides = {}) {
  return {
    videoId: "new-video-id",
    title: "Video Baru",
    link: "https://www.youtube.com/watch?v=new-video-id",
    thumbnailUrl: "https://i.ytimg.com/vi/new-video-id/hqdefault.jpg",
    publishedAt: "2026-04-17T00:00:00.000Z",
    isShort: false,
    ...overrides
  };
}

function createClientMock({ guildIds = [], onSend, fetchChannel } = {}) {
  const guildEntries = guildIds.map((id) => [id, { id, name: `Guild ${id}` }]);

  return {
    user: { id: "bot-user" },
    guilds: {
      cache: new Map(guildEntries)
    },
    channels: {
      async fetch(channelId) {
        if (fetchChannel) {
          return fetchChannel(channelId);
        }

        return {
          isTextBased() {
            return true;
          },
          async send(payload) {
            await onSend?.(payload);
          }
        };
      }
    }
  };
}

function createCommonRuntimeDeps({
  trackedChannels,
  recentVideos,
  sendGuildLog,
  updateLastVideoState,
  diagnoseChannelAccess
}) {
  return {
    getAccessControl: async () => ({}),
    isGuildAuthorizedByControl: (_accessControl, guildId) => guildId === "guild-1",
    getAllTrackedChannels: async () => trackedChannels,
    getTitleWatchesByGuild: async () => [],
    fetchRecentVideos: async () => recentVideos,
    inspectYouTubeVideo: async (_videoId, fallbackVideo) => ({
      videoId: fallbackVideo.videoId,
      watchUrl: fallbackVideo.link,
      title: fallbackVideo.title,
      thumbnailUrl: fallbackVideo.thumbnailUrl,
      contentState: "uploaded",
      contentLabel: "Video Panjang",
      publishedAt: fallbackVideo.publishedAt
    }),
    inspectYouTubeLiveHandle: async () => null,
    mergeInspectedVideo: (baseVideo, inspectedVideo) => ({
      ...baseVideo,
      ...inspectedVideo,
      link: inspectedVideo?.watchUrl || baseVideo.link
    }),
    shouldNotifyForVideo: () => true,
    formatNotificationMessage: () => ({ content: "mock-notification", embeds: [] }),
    formatStatusTransitionMessage: () => ({ content: "status-transition", embeds: [] }),
    diagnoseChannelAccess: diagnoseChannelAccess || (() => ({
      ok: true,
      missingPermissions: [],
      details: [],
      cause: "",
      solution: ""
    })),
    diagnoseDiscordSendError: () => ({
      cause: "diagnosed error",
      solution: "fix permission",
      details: []
    }),
    sendGuildLog: sendGuildLog || (async () => {}),
    updateLastVideoState: updateLastVideoState || (async () => ({}))
  };
}

test.afterEach(() => {
  __private.resetPollerRuntimeState();
});

test("integration: runPollCycle mengirim notifikasi tracker untuk video baru", async () => {
  const sentPayloads = [];
  const stateUpdates = [];
  const latestFeedVideo = createLatestFeedVideo();

  __private.setRuntimeDeps(createCommonRuntimeDeps({
    trackedChannels: [createTrackedChannel()],
    recentVideos: [
      latestFeedVideo,
      createLatestFeedVideo({
        videoId: "old-video-id",
        link: "https://www.youtube.com/watch?v=old-video-id"
      })
    ],
    updateLastVideoState: async (guildId, youtubeChannelId, latestVideo) => {
      stateUpdates.push({ guildId, youtubeChannelId, latestVideoId: latestVideo.videoId });
      return {};
    }
  }));

  const client = createClientMock({
    guildIds: ["guild-1"],
    onSend: async (payload) => sentPayloads.push(payload)
  });

  await runPollCycle(client);

  const status = getPollerStatus();
  assert.equal(status.lastCycleStatus, "success");
  assert.equal(status.lastCycleTrackedCount, 1);
  assert.equal(status.lastCycleGuildCount, 1);
  assert.equal(status.cycleCount, 1);
  assert.equal(sentPayloads.length, 1);
  assert.equal(sentPayloads[0].content, "mock-notification");
  assert.equal(stateUpdates.length >= 1, true);
});

test("integration: runPollCycle melewati guild yang tidak authorized", async () => {
  let fetchRecentVideosCalled = false;
  let sentCount = 0;

  __private.setRuntimeDeps({
    getAccessControl: async () => ({}),
    isGuildAuthorizedByControl: () => false,
    getAllTrackedChannels: async () => [createTrackedChannel({
      discord: { guildId: "guild-unauthorized", channelId: "discord-channel-1", roleId: null }
    })],
    getTitleWatchesByGuild: async () => [],
    fetchRecentVideos: async () => {
      fetchRecentVideosCalled = true;
      return [];
    }
  });

  const client = createClientMock({
    guildIds: ["guild-unauthorized"],
    onSend: async () => {
      sentCount += 1;
    }
  });

  await runPollCycle(client);

  const status = getPollerStatus();
  assert.equal(status.lastCycleStatus, "success");
  assert.equal(status.lastCycleTrackedCount, 0);
  assert.equal(status.lastCycleGuildCount, 0);
  assert.equal(fetchRecentVideosCalled, false);
  assert.equal(sentCount, 0);
});

test("integration: runPollCycle preflight permission fail tidak mengirim notif, tetap log dan simpan delivery attempt", async () => {
  const sentPayloads = [];
  const stateUpdates = [];
  const guildLogs = [];
  const latestFeedVideo = createLatestFeedVideo();
  const trackedChannel = createTrackedChannel();

  __private.setRuntimeDeps(createCommonRuntimeDeps({
    trackedChannels: [trackedChannel],
    recentVideos: [
      latestFeedVideo,
      createLatestFeedVideo({
        videoId: "old-video-id",
        link: "https://www.youtube.com/watch?v=old-video-id"
      })
    ],
    diagnoseChannelAccess: () => ({
      ok: false,
      missingPermissions: ["Send Messages"],
      cause: "Bot tidak punya Send Messages",
      solution: "Aktifkan permission Send Messages",
      details: [{ name: "Permission Hilang", value: "Send Messages", inline: false }]
    }),
    sendGuildLog: async (_client, payload) => {
      guildLogs.push(payload);
    },
    updateLastVideoState: async (guildId, youtubeChannelId, latestVideo, options = {}) => {
      stateUpdates.push({ guildId, youtubeChannelId, latestVideoId: latestVideo.videoId, options });
      return {};
    }
  }));

  const client = createClientMock({
    guildIds: ["guild-1"],
    onSend: async (payload) => sentPayloads.push(payload)
  });

  await runPollCycle(client);

  const status = getPollerStatus();
  assert.equal(status.lastCycleStatus, "success");
  assert.equal(sentPayloads.length, 0);
  assert.equal(guildLogs.length >= 1, true);
  assert.equal(guildLogs.some((entry) => entry?.title === "Notifikasi dibatalkan: permission channel kurang"), true);
  assert.equal(
    stateUpdates.some((entry) => {
      return entry.options?.lastDeliveryAttemptSignature
        && entry.options?.lastDeliveryAttemptSignature.includes(latestFeedVideo.videoId);
    }),
    true
  );
});

test("integration: runPollCycle channel fetch fail tidak mengirim notif, kirim warn log, dan simpan delivery attempt", async () => {
  const sentPayloads = [];
  const stateUpdates = [];
  const guildLogs = [];
  const latestFeedVideo = createLatestFeedVideo();

  __private.setRuntimeDeps(createCommonRuntimeDeps({
    trackedChannels: [createTrackedChannel()],
    recentVideos: [
      latestFeedVideo,
      createLatestFeedVideo({
        videoId: "old-video-id",
        link: "https://www.youtube.com/watch?v=old-video-id"
      })
    ],
    sendGuildLog: async (_client, payload) => {
      guildLogs.push(payload);
    },
    updateLastVideoState: async (guildId, youtubeChannelId, latestVideo, options = {}) => {
      stateUpdates.push({ guildId, youtubeChannelId, latestVideoId: latestVideo.videoId, options });
      return {};
    }
  }));

  const client = createClientMock({
    guildIds: ["guild-1"],
    onSend: async (payload) => sentPayloads.push(payload),
    fetchChannel: async () => {
      const error = new Error("Missing Access");
      error.code = 50001;
      throw error;
    }
  });

  await runPollCycle(client);

  const status = getPollerStatus();
  assert.equal(status.lastCycleStatus, "success");
  assert.equal(sentPayloads.length, 0);
  assert.equal(guildLogs.some((entry) => entry?.title === "Channel tracker tidak valid"), true);
  assert.equal(
    stateUpdates.some((entry) => {
      return entry.options?.lastDeliveryAttemptSignature
        && entry.options?.lastDeliveryAttemptSignature.includes(latestFeedVideo.videoId);
    }),
    true
  );
});
