"use strict";

const { SessionStore } = require("./sessionStore");
const { RedisSessionStore } = require("./redisSessionStore");

function createSessionStore(options = {}) {
  const env = options.env || {};
  const driver = String(env.sessionStoreDriver || "file").trim().toLowerCase();

  if (driver === "redis") {
    const redisUrl = String(env.sessionRedisUrl || "").trim();
    if (!redisUrl) {
      throw new Error("DASHBOARD_SESSION_STORE=redis membutuhkan DASHBOARD_REDIS_URL.");
    }

    return new RedisSessionStore({
      ttlMs: env.sessionTtlMs,
      redisUrl,
      keyPrefix: env.sessionRedisPrefix || "conot:dashboard"
    });
  }

  if (driver !== "file") {
    throw new Error(
      `DASHBOARD_SESSION_STORE tidak valid: "${driver}". Gunakan "file" atau "redis".`
    );
  }

  return new SessionStore({
    ttlMs: env.sessionTtlMs,
    persistFilePath: options.persistFilePath || env.sessionFilePath
  });
}

module.exports = {
  createSessionStore
};
