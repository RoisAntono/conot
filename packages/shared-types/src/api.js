"use strict";

const ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN_GUILD: "FORBIDDEN_GUILD",
  FORBIDDEN_PERMISSION: "FORBIDDEN_PERMISSION",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  YOUTUBE_SOURCE_INVALID: "YOUTUBE_SOURCE_INVALID",
  DISCORD_CHANNEL_INVALID: "DISCORD_CHANNEL_INVALID",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  NOT_FOUND: "NOT_FOUND"
};

function ok(data, meta) {
  return {
    ok: true,
    data,
    ...(meta ? { meta } : {})
  };
}

function fail(code, message, details, traceId) {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {})
    },
    ...(traceId ? { traceId } : {})
  };
}

module.exports = {
  ERROR_CODES,
  ok,
  fail
};
