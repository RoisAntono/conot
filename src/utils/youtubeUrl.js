const { YOUTUBE_BASE_URL } = require("../config/constants");

function buildWatchUrl(videoId) {
  return `${YOUTUBE_BASE_URL}/watch?v=${videoId}`;
}

function buildChannelUrl(channelId) {
  return `${YOUTUBE_BASE_URL}/channel/${channelId}`;
}

function buildHandleUrl(handle) {
  const normalizedHandle = String(handle || "").trim().replace(/^\/+/, "");
  return `${YOUTUBE_BASE_URL}/${normalizedHandle}`;
}

function buildThumbnailUrl(videoId, quality = "hqdefault") {
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}

module.exports = {
  buildChannelUrl,
  buildHandleUrl,
  buildThumbnailUrl,
  buildWatchUrl
};
