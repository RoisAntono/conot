"use strict";

function buildNotificationSignature(parts) {
  if (!Array.isArray(parts) || parts.length === 0) {
    return "";
  }
  return parts
    .map((part) => String(part == null ? "" : part).trim().toLowerCase())
    .join(":");
}

module.exports = {
  buildNotificationSignature
};
