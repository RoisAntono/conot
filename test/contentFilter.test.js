const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getContentFilterLabel,
  normalizeContentFilter,
  passesContentFilter
} = require("../src/utils/contentFilter");

test("normalizeContentFilter supports legacy and alias values", () => {
  assert.equal(normalizeContentFilter("long"), "video");
  assert.equal(normalizeContentFilter("upload"), "video");
  assert.equal(normalizeContentFilter("liveupcoming"), "live_upcoming");
  assert.equal(normalizeContentFilter("premiere_video"), "premiere_published");
});

test("passesContentFilter matches aggregate and exact content states", () => {
  assert.equal(
    passesContentFilter("live", { contentState: "live" }),
    true
  );
  assert.equal(
    passesContentFilter("live", { contentState: "replay_stream" }),
    true
  );
  assert.equal(
    passesContentFilter("live_now", { contentState: "live" }),
    true
  );
  assert.equal(
    passesContentFilter("live_now", { contentState: "upcoming" }),
    false
  );
  assert.equal(
    passesContentFilter("premiere", { contentState: "premiere_upcoming" }),
    true
  );
  assert.equal(getContentFilterLabel("live_replay"), "Replay Live");
});
