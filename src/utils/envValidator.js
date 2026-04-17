const BOOLEAN_TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const BOOLEAN_FALSE_VALUES = new Set(["0", "false", "no", "off"]);

function isBlank(value) {
  return String(value ?? "").trim().length === 0;
}

function parseBooleanish(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (BOOLEAN_TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (BOOLEAN_FALSE_VALUES.has(normalized)) {
    return false;
  }

  return null;
}

function countSnowflakeList(env, name) {
  if (isBlank(env[name])) {
    return 0;
  }

  return String(env[name])
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^\d{10,20}$/.test(item))
    .length;
}

function validateDiscordToken(value) {
  const token = String(value || "").trim();

  if (!token) {
    throw new Error("DISCORD_TOKEN belum diatur di environment.");
  }

  if (/\s/.test(token)) {
    throw new Error("DISCORD_TOKEN tidak boleh mengandung spasi atau newline.");
  }

  if (token.toLowerCase().includes("your_discord_bot_token")) {
    throw new Error("DISCORD_TOKEN masih berupa placeholder. Isi token bot Discord yang valid.");
  }

  if (token.length < 30) {
    throw new Error("DISCORD_TOKEN terlalu pendek. Pastikan token bot Discord valid.");
  }
}

function parseStrictInteger(rawValue, name) {
  const normalized = String(rawValue).trim();

  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(`${name} harus berupa integer valid, diterima: "${rawValue}".`);
  }

  const value = Number(normalized);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} di luar batas integer aman JavaScript.`);
  }

  return value;
}

function validateIntegerEnv(env, name, options = {}) {
  if (isBlank(env[name])) {
    return;
  }

  const {
    min = Number.MIN_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER
  } = options;

  const value = parseStrictInteger(env[name], name);
  if (value < min || value > max) {
    throw new Error(`${name} harus berada pada rentang ${min}..${max}, diterima: ${value}.`);
  }
}

function validateBooleanEnv(env, name) {
  if (isBlank(env[name])) {
    return;
  }

  const value = String(env[name]).trim().toLowerCase();
  if (!BOOLEAN_TRUE_VALUES.has(value) && !BOOLEAN_FALSE_VALUES.has(value)) {
    throw new Error(`${name} harus boolean (true/false, 1/0, yes/no, on/off), diterima: "${env[name]}".`);
  }
}

function assertSnowflake(value, name) {
  if (!/^\d{10,20}$/.test(String(value).trim())) {
    throw new Error(`${name} harus berupa Discord snowflake (10-20 digit angka).`);
  }
}

function validateSnowflakeEnv(env, name) {
  if (isBlank(env[name])) {
    return;
  }

  assertSnowflake(env[name], name);
}

function validateSnowflakeListEnv(env, name) {
  if (isBlank(env[name])) {
    return;
  }

  const list = String(env[name])
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const id of list) {
    assertSnowflake(id, `${name} item "${id}"`);
  }
}

function validateOptionalWebhookUrl(env, name) {
  if (isBlank(env[name])) {
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(String(env[name]).trim());
  } catch (_error) {
    throw new Error(`${name} harus berupa URL valid.`);
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error(`${name} hanya menerima protokol http/https.`);
  }
}

function collectEnvironmentIssues(env) {
  const checks = [
    () => validateDiscordToken(env.DISCORD_TOKEN),
    () => validateSnowflakeEnv(env, "GUILD_ID"),
    () => validateSnowflakeListEnv(env, "BOT_OWNER_IDS"),
    () => validateSnowflakeListEnv(env, "OWNER_USER_IDS"),
    () => validateSnowflakeListEnv(env, "GUARD_GUILD_IDS"),
    () => validateSnowflakeListEnv(env, "GUARD_USER_IDS"),
    () => validateSnowflakeListEnv(env, "WHITELIST_GUILD_IDS"),
    () => validateSnowflakeListEnv(env, "WHITELIST_USER_IDS"),
    () => validateBooleanEnv(env, "GUARD_GUILD_WHITELIST_ENABLED"),
    () => validateBooleanEnv(env, "GUARD_USER_WHITELIST_ENABLED"),
    () => validateBooleanEnv(env, "GUARD_LEAVE_UNAUTHORIZED_GUILDS"),
    () => validateBooleanEnv(env, "CANARY_ENABLED"),
    () => validateIntegerEnv(env, "DATA_BACKUP_INTERVAL_MS", { min: 60_000, max: 86_400_000 }),
    () => validateIntegerEnv(env, "DATA_BACKUP_RETENTION", { min: 1, max: 365 }),
    () => validateIntegerEnv(env, "HTTP_RETRY_ATTEMPTS", { min: 1, max: 10 }),
    () => validateIntegerEnv(env, "RSS_RETRY_ATTEMPTS", { min: 1, max: 10 }),
    () => validateIntegerEnv(env, "RETRY_BASE_DELAY_MS", { min: 100, max: 60_000 }),
    () => validateIntegerEnv(env, "NOTIFICATION_HISTORY_WINDOW_MS", { min: 60_000, max: 2_592_000_000 }),
    () => validateIntegerEnv(env, "RSS_FAILURE_LOG_THRESHOLD", { min: 1, max: 100 }),
    () => validateIntegerEnv(env, "RSS_FAILURE_LOG_REPEAT_EVERY", { min: 1, max: 1_000 }),
    () => validateIntegerEnv(env, "RSS_RECENT_VIDEOS_LIMIT", { min: 1, max: 20 }),
    () => validateIntegerEnv(env, "MAX_TRACKERS_PER_GUILD", { min: 1, max: 5_000 }),
    () => validateIntegerEnv(env, "MAX_TITLE_WATCHES_PER_GUILD", { min: 1, max: 5_000 }),
    () => validateIntegerEnv(env, "CANARY_INTERVAL_MS", { min: 60_000, max: 86_400_000 }),
    () => validateIntegerEnv(env, "CANARY_FAILURE_THRESHOLD", { min: 1, max: 20 }),
    () => validateIntegerEnv(env, "SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS", { min: 500, max: 600_000 }),
    () => validateOptionalWebhookUrl(env, "EXTERNAL_LOG_WEBHOOK_URL"),
    () => {
      const userWhitelistEnabled = parseBooleanish(env.GUARD_USER_WHITELIST_ENABLED);
      if (userWhitelistEnabled !== true) {
        return;
      }

      const totalOwnerIds =
        countSnowflakeList(env, "BOT_OWNER_IDS") +
        countSnowflakeList(env, "OWNER_USER_IDS");

      if (!totalOwnerIds) {
        throw new Error(
          "GUARD_USER_WHITELIST_ENABLED=true membutuhkan minimal satu owner pada BOT_OWNER_IDS/OWNER_USER_IDS agar bot tidak lockout."
        );
      }
    }
  ];

  const issues = [];

  for (const check of checks) {
    try {
      check();
    } catch (error) {
      issues.push(error.message);
    }
  }

  return issues;
}

function validateEnvironmentVariables(env = process.env) {
  const issues = collectEnvironmentIssues(env);

  if (issues.length) {
    throw new Error(`Konfigurasi environment tidak valid:\n- ${issues.join("\n- ")}`);
  }
}

module.exports = {
  validateEnvironmentVariables,
  __private: {
    collectEnvironmentIssues,
    countSnowflakeList,
    parseStrictInteger,
    parseBooleanish,
    validateDiscordToken,
    validateBooleanEnv,
    validateIntegerEnv,
    validateOptionalWebhookUrl,
    validateSnowflakeEnv,
    validateSnowflakeListEnv
  }
};
