const test = require("node:test");
const assert = require("node:assert/strict");
const { __private } = require("../src/utils/youtubeSearchScraper");

test("parseDurationText parses short and long durations", () => {
  assert.equal(__private.parseDurationText("0:59"), 59);
  assert.equal(__private.parseDurationText("12:34"), 754);
  assert.equal(__private.parseDurationText("1:02:03"), 3723);
  assert.equal(__private.parseDurationText(""), null);
});

test("detectSearchResultState classifies short video by duration as shorts", () => {
  const state = __private.detectSearchResultState({
    title: {
      runs: [{ text: "DR TIRTA NGAJARIN DR GIA MARAHIN PASIEN!" }]
    },
    lengthText: {
      simpleText: "0:24"
    },
    thumbnailOverlays: []
  });

  assert.equal(state.contentState, "shorts");
  assert.equal(state.contentLabel, "Shorts");
  assert.equal(state.isShort, true);
  assert.equal(state.durationSeconds, 24);
});

test("detectSearchResultState classifies replay stream from published text", () => {
  const state = __private.detectSearchResultState({
    title: {
      runs: [{ text: "MIYA HEBAT MANTAP TERBAIK" }]
    },
    lengthText: {
      simpleText: "2:03:11"
    },
    thumbnailOverlays: []
  }, "Streaming 5 jam yang lalu");

  assert.equal(state.contentState, "replay_stream");
  assert.equal(state.contentLabel, "Replay Stream");
  assert.equal(state.isShort, false);
});
