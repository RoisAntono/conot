"use strict";

const { ERROR_CODES, fail } = require("@conot/shared-types");
const { sendJson } = require("../lib/http");

function enforceRateLimit(req, res, appContext, options = {}) {
  const guildId = String(options.guildId || "").trim();
  const userId = String(options.userId || "").trim();
  const scope = String(options.scope || "mutation").trim();
  const windowMs = Number(options.windowMs) || 10_000;
  const maxRequests = Number(options.maxRequests) || 5;
  const message = options.message || "Terlalu banyak request. Coba lagi beberapa detik.";

  const rateKey = `${scope}:${guildId}:${userId}`;
  const rate = appContext.rateLimitService.check(rateKey, windowMs, maxRequests);
  if (rate.allowed) {
    return true;
  }

  sendJson(
    res,
    429,
    fail(
      ERROR_CODES.RATE_LIMITED,
      message,
      {
        resetAt: new Date(rate.resetAt).toISOString(),
        windowMs,
        maxRequests
      },
      req.traceId
    )
  );
  return false;
}

module.exports = {
  enforceRateLimit
};
