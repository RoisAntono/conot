"use strict";

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseList(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseStorageDriver(value) {
  const normalized = String(value || "json").trim().toLowerCase();
  if (normalized === "sqlite") {
    return "sqlite";
  }
  return "json";
}

function loadEnv() {
  const hasDiscordOAuthCredentials = Boolean(
    process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
  );

  return {
    nodeEnv: process.env.NODE_ENV || "development",
    port: parseNumber(process.env.DASHBOARD_API_PORT, 4310),
    host: process.env.DASHBOARD_API_HOST || "::",
    baseUrl: process.env.DASHBOARD_API_BASE_URL || "http://localhost:4310",
    webOrigin: process.env.DASHBOARD_WEB_ORIGIN || "http://localhost:4320",
    sessionCookieName: process.env.DASHBOARD_SESSION_COOKIE_NAME || "conot_session",
    sessionStoreDriver: (process.env.DASHBOARD_SESSION_STORE || "file").toLowerCase(),
    sessionTtlMs: parseNumber(process.env.DASHBOARD_SESSION_TTL_MS, 1000 * 60 * 60 * 24 * 7),
    sessionSecret: process.env.DASHBOARD_SESSION_SECRET || "change-me-dashboard-session-secret",
    sessionRedisUrl: process.env.DASHBOARD_REDIS_URL || "",
    sessionRedisPrefix: process.env.DASHBOARD_REDIS_PREFIX || "conot:dashboard",
    authMode: process.env.DASHBOARD_AUTH_MODE || (hasDiscordOAuthCredentials ? "discord" : "mock"),
    discordClientId: process.env.DISCORD_CLIENT_ID || "",
    discordClientSecret: process.env.DISCORD_CLIENT_SECRET || "",
    discordRedirectUri:
      process.env.DISCORD_REDIRECT_URI || "http://localhost:4310/v1/auth/discord/callback",
    discordApiTimeoutMs: parseNumber(process.env.DISCORD_API_TIMEOUT_MS, 12_000),
    discordBotGuildCacheMs: parseNumber(process.env.DISCORD_BOT_GUILD_CACHE_MS, 60_000),
    discordBotToken: process.env.DISCORD_TOKEN || "",
    ownerUserIds: parseList(process.env.BOT_OWNER_IDS || process.env.OWNER_USER_IDS || ""),
    mockUserId: process.env.DASHBOARD_MOCK_USER_ID || "100000000000000001",
    mockUsername: process.env.DASHBOARD_MOCK_USERNAME || "mock-admin",
    mockGuildIds: parseList(process.env.DASHBOARD_MOCK_GUILD_IDS || "123456789012345678"),
    mockAdminGuildIds: parseList(
      process.env.DASHBOARD_MOCK_ADMIN_GUILD_IDS || process.env.DASHBOARD_MOCK_GUILD_IDS || "123456789012345678"
    ),
    allowMockAutoLogin: parseBoolean(process.env.DASHBOARD_MOCK_AUTO_LOGIN, true),
    defaultReturnTo: process.env.DASHBOARD_DEFAULT_RETURN_TO || "http://localhost:4320/dashboard",
    configServiceToken: process.env.CONFIG_SERVICE_TOKEN || "",
    dataFilePath: process.env.DATA_FILE_PATH || "data/data.json",
    configStorageDriver: parseStorageDriver(process.env.DASHBOARD_CONFIG_STORAGE_DRIVER),
    sqliteFilePath: process.env.DASHBOARD_SQLITE_FILE_PATH || "data/dashboard-config.sqlite",
    sessionFilePath: process.env.DASHBOARD_SESSION_FILE_PATH || "data/dashboard-sessions.json",
    csrfHeaderName: process.env.DASHBOARD_CSRF_HEADER_NAME || "x-csrf-token",
    mutationRateWindowMs: parseNumber(process.env.DASHBOARD_MUTATION_RATE_WINDOW_MS, 10_000),
    mutationRateMaxRequests: parseNumber(process.env.DASHBOARD_MUTATION_RATE_MAX, 8),
    previewRateWindowMs: parseNumber(process.env.DASHBOARD_PREVIEW_RATE_WINDOW_MS, 10_000),
    previewRateMaxRequests: parseNumber(process.env.DASHBOARD_PREVIEW_RATE_MAX, 2)
  };
}

module.exports = {
  loadEnv
};
