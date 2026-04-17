const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getVideoTimestampMs,
  hasResolvableVideoTimestamp,
  isVideoWithinMaxAgeDays
} = require("../src/utils/videoAge");

test("getVideoTimestampMs resolves publishedAt/startedAt/scheduledStartAt", () => {
  const publishedAt = "2026-04-17T00:00:00.000Z";
  const startedAt = "2026-04-17T01:00:00.000Z";
  const scheduledStartAt = "2026-04-17T02:00:00.000Z";

  assert.equal(getVideoTimestampMs({ publishedAt }) > 0, true);
  assert.equal(getVideoTimestampMs({ startedAt }), new Date(startedAt).getTime());
  assert.equal(getVideoTimestampMs({ scheduledStartAt }), new Date(scheduledStartAt).getTime());
});

test("hasResolvableVideoTimestamp returns true only when timestamp exists", () => {
  assert.equal(hasResolvableVideoTimestamp({ publishedAt: new Date().toISOString() }), true);
  assert.equal(hasResolvableVideoTimestamp({ contentState: "uploaded" }), false);
});

test("isVideoWithinMaxAgeDays allows upcoming/live without timestamp", () => {
  assert.equal(isVideoWithinMaxAgeDays({ contentState: "upcoming" }, 3), true);
  assert.equal(isVideoWithinMaxAgeDays({ contentState: "uploaded" }, 3), false);
});

test("isVideoWithinMaxAgeDays respects max age for timestamped video", () => {
  const recent = { publishedAt: new Date(Date.now() - (1 * 24 * 60 * 60 * 1000)).toISOString() };
  const stale = { publishedAt: new Date(Date.now() - (10 * 24 * 60 * 60 * 1000)).toISOString() };

  assert.equal(isVideoWithinMaxAgeDays(recent, 3), true);
  assert.equal(isVideoWithinMaxAgeDays(stale, 3), false);
});
