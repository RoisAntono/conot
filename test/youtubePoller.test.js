const test = require("node:test");
const assert = require("node:assert/strict");
const { __private } = require("../src/services/youtubePoller");

test("shouldSendStatusFollowUp true when live transitions to replay on same video", () => {
  const result = __private.shouldSendStatusFollowUp(
    {
      lastNotifiedVideoId: "abc123xyz09",
      lastNotifiedContentState: "live"
    },
    {
      videoId: "abc123xyz09",
      contentState: "replay_stream"
    }
  );

  assert.equal(result, true);
});

test("shouldSendStatusFollowUp false when video ID differs", () => {
  const result = __private.shouldSendStatusFollowUp(
    {
      lastNotifiedVideoId: "abc123xyz09",
      lastNotifiedContentState: "live"
    },
    {
      videoId: "zzz123xyz09",
      contentState: "replay_stream"
    }
  );

  assert.equal(result, false);
});

test("isWithinTitleWatchMaxAge respects max age window", () => {
  const recentVideo = {
    publishedAt: new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString(),
    contentState: "uploaded"
  };
  const staleVideo = {
    publishedAt: new Date(Date.now() - (10 * 24 * 60 * 60 * 1000)).toISOString(),
    contentState: "uploaded"
  };

  assert.equal(__private.isWithinTitleWatchMaxAge({ maxAgeDays: 3 }, recentVideo), true);
  assert.equal(__private.isWithinTitleWatchMaxAge({ maxAgeDays: 3 }, staleVideo), false);
});

test("isWithinTitleWatchMaxAge allows upcoming/live without timestamp", () => {
  assert.equal(
    __private.isWithinTitleWatchMaxAge({ maxAgeDays: 3 }, { contentState: "upcoming" }),
    true
  );
  assert.equal(
    __private.isWithinTitleWatchMaxAge({ maxAgeDays: 3 }, { contentState: "uploaded" }),
    false
  );
});

test("pickTrackerNewVideoCandidates returns only unseen window before boundary", () => {
  const trackedChannel = {
    lastVideoId: "vid_b",
    recentSeenVideoIds: ["vid_a", "vid_b"]
  };
  const recentVideos = [
    { videoId: "vid_d" },
    { videoId: "vid_c" },
    { videoId: "vid_b" },
    { videoId: "vid_a" }
  ];

  const result = __private.pickTrackerNewVideoCandidates(trackedChannel, recentVideos);
  assert.equal(result.hasBoundary, true);
  assert.deepEqual(result.candidates.map((item) => item.videoId), ["vid_d", "vid_c"]);
});

test("normalizeTrackerSeenIds keeps newest and deduplicates", () => {
  const result = __private.normalizeTrackerSeenIds(
    ["vid_b", "vid_a", "vid_b"],
    ["vid_c", "vid_b"],
    "vid_d"
  );

  assert.deepEqual(result.slice(0, 4), ["vid_d", "vid_c", "vid_b", "vid_a"]);
});
