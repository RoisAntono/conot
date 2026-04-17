const test = require("node:test");
const assert = require("node:assert/strict");
const fileDb = require("../src/utils/fileDb");
const rssChecker = require("../src/utils/rssChecker");
const trackerService = require("../src/services/trackerService");
const youtubeScraper = require("../src/utils/youtubeScraper");

test("integration: addChannelTracker menyimpan payload tracker dengan baseline video", async (t) => {
  let capturedPayload = null;

  t.mock.method(youtubeScraper, "scrapeYouTubeChannel", async () => ({
    channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
    username: "@windahbasudara",
    title: "Windah Basudara"
  }));
  t.mock.method(fileDb, "findTrackedChannel", async () => null);
  t.mock.method(fileDb, "getTrackedChannelsByGuild", async () => []);
  t.mock.method(rssChecker, "fetchLatestVideo", async () => ({
    videoId: "abc123xyz09",
    title: "Main GTA Lagi",
    link: "https://www.youtube.com/watch?v=abc123xyz09",
    channelTitle: "Windah Basudara",
    publishedAt: "2026-04-17T00:00:00.000Z",
    contentState: "uploaded"
  }));
  t.mock.method(fileDb, "upsertTrackedChannel", async (payload) => {
    capturedPayload = payload;
    return { entry: payload, isNew: true };
  });

  const result = await trackerService.addChannelTracker({
    guildId: "123456789012345678",
    username: "@windahbasudara",
    targetChannelId: "234567890123456789",
    roleId: "345678901234567890",
    contentFilter: "all",
    customMessage: "Ada video baru dari {channel}!",
    titleFilter: "gta, roleplay",
    embedLayout: "compact"
  });

  assert.equal(result.isNew, true);
  assert.equal(result.latestVideo.videoId, "abc123xyz09");
  assert.equal(capturedPayload.youtube.channelId, "UCaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(capturedPayload.discord.channelId, "234567890123456789");
  assert.equal(capturedPayload.notifications.customMessage, "Ada video baru dari {channel}!");
  assert.deepEqual(capturedPayload.notifications.titleFilters, ["gta", "roleplay"]);
  assert.equal(capturedPayload.lastVideoId, "abc123xyz09");
});

test("integration: addChannelTracker tetap menyimpan tracker saat baseline RSS gagal", async (t) => {
  let capturedPayload = null;

  t.mock.method(youtubeScraper, "scrapeYouTubeChannel", async () => ({
    channelId: "UCbbbbbbbbbbbbbbbbbbbbbb",
    username: "@contohchannel",
    title: "Contoh Channel"
  }));
  t.mock.method(fileDb, "findTrackedChannel", async () => null);
  t.mock.method(fileDb, "getTrackedChannelsByGuild", async () => []);
  t.mock.method(rssChecker, "fetchLatestVideo", async () => {
    throw new Error("RSS unavailable");
  });
  t.mock.method(fileDb, "upsertTrackedChannel", async (payload) => {
    capturedPayload = payload;
    return { entry: payload, isNew: true };
  });

  const result = await trackerService.addChannelTracker({
    guildId: "123456789012345678",
    username: "@contohchannel",
    targetChannelId: "234567890123456789",
    roleId: null,
    contentFilter: "all",
    customMessage: null,
    titleFilter: [],
    embedLayout: "compact"
  });

  assert.equal(result.isNew, true);
  assert.equal(result.latestVideo, null);
  assert.equal(capturedPayload.lastVideoId, null);
  assert.equal(capturedPayload.lastVideoUrl, null);
});
