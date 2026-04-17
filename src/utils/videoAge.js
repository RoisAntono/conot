const NO_TIMESTAMP_ALLOWED_STATES = new Set([
  "live",
  "members_live",
  "upcoming",
  "members_upcoming",
  "premiere_upcoming",
  "members_premiere_upcoming"
]);

function getVideoTimestampMs(video) {
  return new Date(video?.startedAt || video?.publishedAt || video?.scheduledStartAt || 0).getTime();
}

function hasResolvableVideoTimestamp(video) {
  return Boolean(getVideoTimestampMs(video));
}

function isVideoWithinMaxAgeDays(video, maxAgeDays) {
  const ageDays = Number(maxAgeDays);
  const videoTime = getVideoTimestampMs(video);

  if (!ageDays) {
    return false;
  }

  if (!videoTime) {
    return NO_TIMESTAMP_ALLOWED_STATES.has(video?.contentState);
  }

  const thresholdTime = Date.now() - (ageDays * 24 * 60 * 60 * 1000);
  return videoTime >= thresholdTime;
}

module.exports = {
  getVideoTimestampMs,
  hasResolvableVideoTimestamp,
  isVideoWithinMaxAgeDays
};
