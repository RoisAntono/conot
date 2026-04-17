const { DEFAULT_CUSTOM_MESSAGE, LEGACY_DEFAULT_CUSTOM_MESSAGE } = require("../config/constants");

function normalizeCustomMessage(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function resolveCustomMessage(template, latestVideo, trackedChannel) {
  const channelName = trackedChannel.youtube.title || trackedChannel.youtube.username || latestVideo.channelTitle || "channel ini";
  const normalizedTemplate = normalizeCustomMessage(template);
  const message = !normalizedTemplate || normalizedTemplate === LEGACY_DEFAULT_CUSTOM_MESSAGE
    ? DEFAULT_CUSTOM_MESSAGE
    : normalizedTemplate;

  return message
    .replaceAll("{channel}", channelName)
    .replaceAll("{title}", latestVideo.title || "Tanpa Judul")
    .replaceAll("{link}", latestVideo.link || "")
    .replaceAll("{type}", latestVideo.contentLabel || (latestVideo.isShort ? "Shorts" : "Video Panjang"));
}

module.exports = {
  normalizeCustomMessage,
  resolveCustomMessage
};
