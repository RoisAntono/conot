"use strict";

function getVideoAgeDays(publishedAt, now = Date.now()) {
  const publishedMs = new Date(publishedAt || "").getTime();
  if (!Number.isFinite(publishedMs)) {
    return Number.POSITIVE_INFINITY;
  }
  const diffMs = Math.max(0, now - publishedMs);
  return diffMs / (1000 * 60 * 60 * 24);
}

function isWithinMaxAgeDays(publishedAt, maxAgeDays, now = Date.now()) {
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) {
    return true;
  }
  return getVideoAgeDays(publishedAt, now) <= maxAgeDays;
}

module.exports = {
  getVideoAgeDays,
  isWithinMaxAgeDays
};
