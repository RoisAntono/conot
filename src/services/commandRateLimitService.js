const rateLimitState = new Map();
const RATE_LIMIT_STALE_MS = 60 * 60 * 1000;
let lastPruneAt = 0;

function buildRateLimitKey({ guildId, userId, commandKey }) {
  return [
    String(guildId || "dm"),
    String(userId || "unknown"),
    String(commandKey || "unknown")
  ].join(":");
}

function consumeCommandRateLimit({ guildId, userId, commandKey, windowMs }) {
  pruneRateLimitState();

  const normalizedWindowMs = Number(windowMs) || 0;

  if (normalizedWindowMs <= 0) {
    return {
      allowed: true,
      retryAfterMs: 0
    };
  }

  const key = buildRateLimitKey({ guildId, userId, commandKey });
  const now = Date.now();
  const previousTimestamp = rateLimitState.get(key) || 0;
  const elapsedMs = now - previousTimestamp;

  if (previousTimestamp && elapsedMs < normalizedWindowMs) {
    return {
      allowed: false,
      retryAfterMs: normalizedWindowMs - elapsedMs
    };
  }

  rateLimitState.set(key, now);
  return {
    allowed: true,
    retryAfterMs: 0
  };
}

function pruneRateLimitState() {
  const now = Date.now();
  if ((now - lastPruneAt) < 5 * 60 * 1000) {
    return;
  }

  for (const [key, timestamp] of rateLimitState.entries()) {
    if ((now - timestamp) >= RATE_LIMIT_STALE_MS) {
      rateLimitState.delete(key);
    }
  }

  lastPruneAt = now;
}

function resetCommandRateLimitState() {
  rateLimitState.clear();
  lastPruneAt = 0;
}

module.exports = {
  consumeCommandRateLimit,
  resetCommandRateLimitState
};
