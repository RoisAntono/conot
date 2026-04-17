const { CONTENT_FILTERS, DEFAULT_CONTENT_FILTER } = require("../config/constants");

const CONTENT_FILTER_ALIASES = new Map([
  ["all", CONTENT_FILTERS.ALL],
  ["video", CONTENT_FILTERS.VIDEO],
  ["long", CONTENT_FILTERS.VIDEO],
  ["upload", CONTENT_FILTERS.VIDEO],
  ["uploaded", CONTENT_FILTERS.VIDEO],
  ["short", CONTENT_FILTERS.SHORTS],
  ["shorts", CONTENT_FILTERS.SHORTS],
  ["live", CONTENT_FILTERS.LIVE],
  ["live_all", CONTENT_FILTERS.LIVE],
  ["liveupcoming", CONTENT_FILTERS.LIVE_UPCOMING],
  ["live_upcoming", CONTENT_FILTERS.LIVE_UPCOMING],
  ["upcoming_live", CONTENT_FILTERS.LIVE_UPCOMING],
  ["livenow", CONTENT_FILTERS.LIVE_NOW],
  ["live_now", CONTENT_FILTERS.LIVE_NOW],
  ["active_live", CONTENT_FILTERS.LIVE_NOW],
  ["livereplay", CONTENT_FILTERS.LIVE_REPLAY],
  ["live_replay", CONTENT_FILTERS.LIVE_REPLAY],
  ["replay_live", CONTENT_FILTERS.LIVE_REPLAY],
  ["premiere", CONTENT_FILTERS.PREMIERE],
  ["premiere_all", CONTENT_FILTERS.PREMIERE],
  ["premiereupcoming", CONTENT_FILTERS.PREMIERE_UPCOMING],
  ["premiere_upcoming", CONTENT_FILTERS.PREMIERE_UPCOMING],
  ["premierepublished", CONTENT_FILTERS.PREMIERE_PUBLISHED],
  ["premiere_published", CONTENT_FILTERS.PREMIERE_PUBLISHED],
  ["premiere_video", CONTENT_FILTERS.PREMIERE_PUBLISHED]
]);

function normalizeContentFilter(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return CONTENT_FILTER_ALIASES.get(normalized) || DEFAULT_CONTENT_FILTER;
}

function getContentFilterLabel(value) {
  const filter = normalizeContentFilter(value);

  switch (filter) {
    case CONTENT_FILTERS.VIDEO:
      return "Video Panjang / Upload";
    case CONTENT_FILTERS.SHORTS:
      return "Shorts";
    case CONTENT_FILTERS.LIVE:
      return "Semua Live";
    case CONTENT_FILTERS.LIVE_UPCOMING:
      return "Live Akan Datang";
    case CONTENT_FILTERS.LIVE_NOW:
      return "Sedang Live";
    case CONTENT_FILTERS.LIVE_REPLAY:
      return "Replay Live";
    case CONTENT_FILTERS.PREMIERE:
      return "Semua Premiere";
    case CONTENT_FILTERS.PREMIERE_UPCOMING:
      return "Premiere Akan Datang";
    case CONTENT_FILTERS.PREMIERE_PUBLISHED:
      return "Premiere Sudah Tayang";
    default:
      return "Semua Konten";
  }
}

function getContentFilterKey(latestVideo) {
  const state = latestVideo?.contentState || null;

  if (state === "shorts" || latestVideo?.isShort) {
    return CONTENT_FILTERS.SHORTS;
  }

  if (["live", "members_live"].includes(state)) {
    return CONTENT_FILTERS.LIVE_NOW;
  }

  if (["upcoming", "members_upcoming"].includes(state)) {
    return CONTENT_FILTERS.LIVE_UPCOMING;
  }

  if (["replay_stream", "members_replay_stream"].includes(state)) {
    return CONTENT_FILTERS.LIVE_REPLAY;
  }

  if (["premiere_upcoming", "members_premiere_upcoming"].includes(state)) {
    return CONTENT_FILTERS.PREMIERE_UPCOMING;
  }

  if (["premiere_video", "members_premiere_video"].includes(state)) {
    return CONTENT_FILTERS.PREMIERE_PUBLISHED;
  }

  return CONTENT_FILTERS.VIDEO;
}

function passesContentFilter(filter, latestVideo) {
  const normalizedFilter = normalizeContentFilter(filter);
  const contentKey = getContentFilterKey(latestVideo);

  if (normalizedFilter === CONTENT_FILTERS.ALL) {
    return true;
  }

  if (normalizedFilter === CONTENT_FILTERS.LIVE) {
    return [
      CONTENT_FILTERS.LIVE_NOW,
      CONTENT_FILTERS.LIVE_UPCOMING,
      CONTENT_FILTERS.LIVE_REPLAY
    ].includes(contentKey);
  }

  if (normalizedFilter === CONTENT_FILTERS.PREMIERE) {
    return [
      CONTENT_FILTERS.PREMIERE_UPCOMING,
      CONTENT_FILTERS.PREMIERE_PUBLISHED
    ].includes(contentKey);
  }

  return normalizedFilter === contentKey;
}

module.exports = {
  getContentFilterKey,
  getContentFilterLabel,
  normalizeContentFilter,
  passesContentFilter
};
