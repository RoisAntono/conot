"use strict";

const {
  getConfigBoolean,
  getConfigList,
  getConfigNumber,
  getConfigString
} = require("../../../../src/config/appConfig");

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
  const explicitAuthMode = getConfigString("dashboard.authMode", "DASHBOARD_AUTH_MODE", "").trim();

  return {
    nodeEnv: process.env.NODE_ENV || "development",
    port: getConfigNumber("dashboard.apiPort", "DASHBOARD_API_PORT", 4310),
    host: getConfigString("dashboard.apiHost", "DASHBOARD_API_HOST", "::"),
    baseUrl: getConfigString("dashboard.apiBaseUrl", "DASHBOARD_API_BASE_URL", "http://localhost:4310"),
    webOrigin: getConfigString("dashboard.webOrigin", "DASHBOARD_WEB_ORIGIN", "http://localhost:4320"),
    sessionCookieName: getConfigString("dashboard.sessionCookieName", "DASHBOARD_SESSION_COOKIE_NAME", "conot_session"),
    sessionStoreDriver: getConfigString("dashboard.sessionStore", "DASHBOARD_SESSION_STORE", "file").toLowerCase(),
    sessionTtlMs: getConfigNumber("dashboard.sessionTtlMs", "DASHBOARD_SESSION_TTL_MS", 1000 * 60 * 60 * 24 * 7),
    sessionSecret: process.env.DASHBOARD_SESSION_SECRET || "change-me-dashboard-session-secret",
    sessionRedisUrl: process.env.DASHBOARD_REDIS_URL || "",
    sessionRedisPrefix: getConfigString("dashboard.redisPrefix", "DASHBOARD_REDIS_PREFIX", "conot:dashboard"),
    authMode: explicitAuthMode || (hasDiscordOAuthCredentials ? "discord" : "mock"),
    discordClientId: process.env.DISCORD_CLIENT_ID || "",
    discordClientSecret: process.env.DISCORD_CLIENT_SECRET || "",
    discordRedirectUri: getConfigString(
      "dashboard.discordRedirectUri",
      "DISCORD_REDIRECT_URI",
      "http://localhost:4310/v1/auth/discord/callback"
    ),
    discordApiTimeoutMs: getConfigNumber("dashboard.discordApiTimeoutMs", "DISCORD_API_TIMEOUT_MS", 12_000),
    discordBotGuildCacheMs: getConfigNumber("dashboard.discordBotGuildCacheMs", "DISCORD_BOT_GUILD_CACHE_MS", 60_000),
    discordBotToken: process.env.DISCORD_TOKEN || "",
    ownerUserIds: parseList(process.env.BOT_OWNER_IDS || process.env.OWNER_USER_IDS || ""),
    mockUserId: getConfigString("dashboard.mockUserId", "DASHBOARD_MOCK_USER_ID", "100000000000000001"),
    mockUsername: getConfigString("dashboard.mockUsername", "DASHBOARD_MOCK_USERNAME", "mock-admin"),
    mockGuildIds: getConfigList("dashboard.mockGuildIds", "DASHBOARD_MOCK_GUILD_IDS", ["123456789012345678"]),
    mockAdminGuildIds: getConfigList(
      "dashboard.mockAdminGuildIds",
      "DASHBOARD_MOCK_ADMIN_GUILD_IDS",
      getConfigList("dashboard.mockGuildIds", "DASHBOARD_MOCK_GUILD_IDS", ["123456789012345678"])
    ),
    allowMockAutoLogin: getConfigBoolean("dashboard.mockAutoLogin", "DASHBOARD_MOCK_AUTO_LOGIN", true),
    defaultReturnTo: getConfigString("dashboard.defaultReturnTo", "DASHBOARD_DEFAULT_RETURN_TO", "http://localhost:4320/dashboard"),
    configServiceToken: process.env.CONFIG_SERVICE_TOKEN || "",
    dataFilePath: getConfigString("bot.dataFilePath", "DATA_FILE_PATH", "data/data.json"),
    configStorageDriver: parseStorageDriver(getConfigString("dashboard.configStorageDriver", "DASHBOARD_CONFIG_STORAGE_DRIVER", "json")),
    sqliteFilePath: getConfigString("dashboard.sqliteFilePath", "DASHBOARD_SQLITE_FILE_PATH", "data/dashboard-config.sqlite"),
    sessionFilePath: getConfigString("dashboard.sessionFilePath", "DASHBOARD_SESSION_FILE_PATH", "data/dashboard-sessions.json"),
    csrfHeaderName: getConfigString("dashboard.csrfHeaderName", "DASHBOARD_CSRF_HEADER_NAME", "x-csrf-token"),
    mutationRateWindowMs: getConfigNumber("dashboard.mutationRateWindowMs", "DASHBOARD_MUTATION_RATE_WINDOW_MS", 10_000),
    mutationRateMaxRequests: getConfigNumber("dashboard.mutationRateMax", "DASHBOARD_MUTATION_RATE_MAX", 8),
    previewRateWindowMs: getConfigNumber("dashboard.previewRateWindowMs", "DASHBOARD_PREVIEW_RATE_WINDOW_MS", 10_000),
    previewRateMaxRequests: getConfigNumber("dashboard.previewRateMax", "DASHBOARD_PREVIEW_RATE_MAX", 2)
  };
}

module.exports = {
  loadEnv
};
