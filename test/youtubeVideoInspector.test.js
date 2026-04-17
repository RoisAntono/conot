const test = require("node:test");
const assert = require("node:assert/strict");
const { __private } = require("../src/utils/youtubeVideoInspector");

test("classifyBroadcastStatus marks replay when isLiveContent is true and stream already ended", () => {
  const state = __private.classifyBroadcastStatus({
    videoDetails: {
      isLiveContent: true,
      isLive: false,
      isUpcoming: false,
      isPostLiveDvr: false
    },
    microformat: {
      playerMicroformatRenderer: {
        publishDate: "2026-04-17T00:00:00+00:00"
      }
    },
    playabilityStatus: {}
  }, "", null);

  assert.equal(state.contentState, "replay_stream");
  assert.equal(state.contentLabel, "Replay Stream");
});

test("classifyBroadcastStatus keeps uploaded for normal non-live content", () => {
  const state = __private.classifyBroadcastStatus({
    videoDetails: {
      isLiveContent: false,
      isLive: false,
      isUpcoming: false
    },
    microformat: {
      playerMicroformatRenderer: {
        publishDate: "2026-04-17T00:00:00+00:00"
      }
    },
    playabilityStatus: {}
  }, "", null);

  assert.equal(state.contentState, "uploaded");
  assert.equal(state.contentLabel, "Video Panjang");
});
