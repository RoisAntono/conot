const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatNotificationMessage,
  shouldNotifyForVideo
} = require("../src/utils/rssChecker");

test("integration: notify flow passes filter and renders role mention outside embed", () => {
  const trackedChannel = {
    youtube: {
      username: "@windahbasudara",
      title: "Windah Basudara"
    },
    discord: {
      roleId: "123456789012345678"
    },
    notifications: {
      contentFilter: "video",
      titleFilters: ["gta", "roleplay"],
      customMessage: "Ada video baru dari {channel}! {title} - {link}"
    }
  };

  const latestVideo = {
    videoId: "abc123xyz09",
    title: "Main GTA Roleplay Lagi",
    link: "https://www.youtube.com/watch?v=abc123xyz09",
    contentState: "uploaded",
    contentLabel: "Video Panjang",
    channelTitle: "Windah Basudara"
  };

  const shouldNotify = shouldNotifyForVideo(trackedChannel, latestVideo);
  assert.equal(shouldNotify, true);

  const payload = formatNotificationMessage(trackedChannel, latestVideo);
  assert.ok(payload.content.includes("Ada video baru dari Windah Basudara!"));
  assert.ok(payload.content.includes("<@&123456789012345678>"));
  assert.equal(Array.isArray(payload.embeds), true);
  assert.equal(payload.embeds.length > 0, true);
});
