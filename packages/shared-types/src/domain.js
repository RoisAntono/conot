"use strict";

const CONTENT_FILTERS = Object.freeze([
  "all",
  "video",
  "shorts",
  "live",
  "live_upcoming",
  "live_now",
  "live_replay",
  "premiere",
  "premiere_upcoming",
  "premiere_published"
]);

const EMBED_LAYOUTS = Object.freeze(["compact", "rich"]);

const LOG_LEVELS = Object.freeze(["warn", "error"]);

module.exports = {
  CONTENT_FILTERS,
  EMBED_LAYOUTS,
  LOG_LEVELS
};
