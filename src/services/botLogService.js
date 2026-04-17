const axios = require("axios");
const { ChannelType, EmbedBuilder } = require("discord.js");
const {
  EXTERNAL_LOG_WEBHOOK_URL,
  LOG_GUARD_WINDOW_MS,
  LOG_LEVELS
} = require("../config/constants");
const {
  getDevLogSettings,
  getLogChannelIdForGuild,
  getLogLevelForGuild
} = require("./logChannelService");
const { sanitizeExternalError } = require("../utils/errorSanitizer");
const { readData } = require("../utils/fileDb");
const logger = require("../utils/logger");

const LEVEL_COLORS = {
  info: 0x2563eb,
  warn: 0xf59e0b,
  error: 0xdc2626
};

const LEVEL_PRIORITY = {
  [LOG_LEVELS.INFO]: 10,
  [LOG_LEVELS.WARN]: 20,
  [LOG_LEVELS.ERROR]: 30
};

let activeClient = null;
const userLogGuardState = new Map();
const devLogGuardState = new Map();
const externalLogGuardState = new Map();

function truncate(value, maxLength = 1000) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

function normalizeLevel(value) {
  const normalized = String(value || LOG_LEVELS.INFO).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LEVEL_PRIORITY, normalized)) {
    return normalized;
  }

  return LOG_LEVELS.INFO;
}

function shouldEmitByLevel(eventLevel, minimumLevel) {
  return LEVEL_PRIORITY[normalizeLevel(eventLevel)] >= LEVEL_PRIORITY[normalizeLevel(minimumLevel)];
}

function formatErrorStack(error) {
  if (!error) {
    return null;
  }

  return truncate(sanitizeExternalError(error), 1000);
}

function formatErrorSummary(error) {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return truncate(error.message || error.name || "Unknown error", 300);
  }

  return truncate(String(error), 300);
}

function normalizeDetails(details = []) {
  return details
    .map((item) => ({
      name: truncate(item?.name, 256),
      value: truncate(item?.value, 1024),
      inline: Boolean(item?.inline)
    }))
    .filter((item) => item.name && item.value)
    .slice(0, 10);
}

function buildLogEmbed({
  level = LOG_LEVELS.INFO,
  scope = "System",
  title,
  description,
  details = [],
  error = null,
  includeErrorStack = false
}) {
  const normalizedLevel = normalizeLevel(level);
  const embed = new EmbedBuilder()
    .setColor(LEVEL_COLORS[normalizedLevel] || LEVEL_COLORS.info)
    .setTitle(`[${String(normalizedLevel).toUpperCase()}] ${title || "Bot Log"}`)
    .setDescription(description || "Tidak ada deskripsi.")
    .setFooter({ text: `Scope: ${scope}` })
    .setTimestamp();

  const fields = normalizeDetails(details);
  const errorSummary = formatErrorSummary(error);
  const errorStack = includeErrorStack ? formatErrorStack(error) : null;

  if (errorSummary) {
    fields.push({
      name: includeErrorStack ? "Ringkasan Error" : "Error",
      value: `\`${errorSummary}\``,
      inline: false
    });
  }

  if (errorStack) {
    fields.push({
      name: "Stack Trace",
      value: `\`\`\`\n${errorStack}\n\`\`\``,
      inline: false
    });
  }

  if (fields.length) {
    embed.addFields(fields);
  }

  return embed;
}

function isValidLogChannel(channel) {
  return Boolean(
    channel &&
    channel.isTextBased?.() &&
    [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)
  );
}

function buildUserLogGuardKey(payload) {
  const guildId = payload?.guildId || "global";
  const signature = payload?.logSignature;
  if (!signature) {
    return null;
  }

  return `${guildId}:${signature}`;
}

function buildDevLogGuardKey(payload) {
  const signature = payload?.logSignature || `${payload?.scope || "System"}:${payload?.title || "Bot Log"}`;
  return `${payload?.guildId || "global"}:${signature}`;
}

function buildExternalLogGuardKey(payload) {
  return [
    String(payload?.scope || "System"),
    String(payload?.title || "Bot Log"),
    String(payload?.logSignature || "no-signature")
  ].join(":");
}

function pruneExpiredGuards(map) {
  const now = Date.now();
  for (const [key, timestamp] of map.entries()) {
    if ((now - timestamp) >= LOG_GUARD_WINDOW_MS) {
      map.delete(key);
    }
  }
}

function shouldSkipGuard(map, key) {
  if (!key) {
    return false;
  }

  pruneExpiredGuards(map);
  const previousTimestamp = map.get(key) || 0;
  return previousTimestamp && (Date.now() - previousTimestamp) < LOG_GUARD_WINDOW_MS;
}

function rememberGuard(map, key) {
  if (!key) {
    return;
  }

  pruneExpiredGuards(map);
  map.set(key, Date.now());
}

function buildExternalLogPayload(payload) {
  return {
    level: normalizeLevel(payload?.level),
    scope: payload?.scope || "System",
    title: payload?.title || "Bot Log",
    description: payload?.description || "",
    guildId: payload?.guildId || null,
    details: normalizeDetails(payload?.details || []),
    error: payload?.error ? sanitizeExternalError(payload.error) : null,
    timestamp: new Date().toISOString()
  };
}

async function sendExternalLog(payload) {
  if (!EXTERNAL_LOG_WEBHOOK_URL) {
    return false;
  }

  const level = normalizeLevel(payload?.level);
  if (![LOG_LEVELS.WARN, LOG_LEVELS.ERROR].includes(level)) {
    return false;
  }

  const guardKey = buildExternalLogGuardKey(payload);
  if (shouldSkipGuard(externalLogGuardState, guardKey)) {
    return false;
  }

  try {
    await axios.post(EXTERNAL_LOG_WEBHOOK_URL, buildExternalLogPayload(payload), {
      timeout: 10000
    });
    rememberGuard(externalLogGuardState, guardKey);
    return true;
  } catch (error) {
    logger.warn("Gagal mengirim external observability log.", error);
    return false;
  }
}

async function fetchLogChannel(client, channelId, contextLabel) {
  const channel = await client.channels.fetch(channelId).catch((error) => {
    logger.warn(`Gagal mengambil ${contextLabel} channel Discord ${channelId}.`, error);
    return null;
  });

  if (!isValidLogChannel(channel)) {
    logger.warn(`${contextLabel} channel ${channelId} tidak ditemukan atau bukan text channel yang valid.`);
    return null;
  }

  return channel;
}

async function sendUserGuildLog(client, payload) {
  const guildId = payload?.guildId;
  if (!client || !guildId) {
    return false;
  }

  const eventLevel = normalizeLevel(payload?.level);
  const guildLogLevel = await getLogLevelForGuild(guildId);
  if (!shouldEmitByLevel(eventLevel, guildLogLevel)) {
    return false;
  }

  const logChannelId = await getLogChannelIdForGuild(guildId);
  if (!logChannelId) {
    return false;
  }

  const guardKey = buildUserLogGuardKey(payload);
  if (shouldSkipGuard(userLogGuardState, guardKey)) {
    return false;
  }

  const globalLogging = await getDevLogSettings();
  const channel = await fetchLogChannel(client, logChannelId, "user-log");
  if (!channel) {
    return false;
  }

  try {
    await channel.send({
      embeds: [buildLogEmbed({
        ...payload,
        includeErrorStack: Boolean(globalLogging?.userIncludeErrorStack)
      })]
    });
    rememberGuard(userLogGuardState, guardKey);
    return true;
  } catch (error) {
    logger.warn(`Gagal mengirim user log ke channel ${logChannelId} pada guild ${guildId}.`, error);
    return false;
  }
}

async function sendDevLog(client, payload) {
  if (!client) {
    return false;
  }

  const globalLogging = await getDevLogSettings();
  const devLogChannelId = globalLogging?.devLogChannelId || null;
  if (!devLogChannelId) {
    return false;
  }

  const eventLevel = normalizeLevel(payload?.level);
  const devLogLevel = normalizeLevel(globalLogging?.devLogLevel || LOG_LEVELS.WARN);
  if (!shouldEmitByLevel(eventLevel, devLogLevel)) {
    return false;
  }

  const guardKey = buildDevLogGuardKey(payload);
  if (shouldSkipGuard(devLogGuardState, guardKey)) {
    return false;
  }

  const channel = await fetchLogChannel(client, devLogChannelId, "dev-log");
  if (!channel) {
    return false;
  }

  const details = [...normalizeDetails(payload?.details || [])];
  if (payload?.guildId) {
    details.unshift({
      name: "Guild ID",
      value: `\`${payload.guildId}\``,
      inline: true
    });
  }

  try {
    await channel.send({
      embeds: [buildLogEmbed({
        ...payload,
        details,
        includeErrorStack: true
      })]
    });
    rememberGuard(devLogGuardState, guardKey);
    return true;
  } catch (error) {
    logger.warn(`Gagal mengirim dev log ke channel ${devLogChannelId}.`, error);
    return false;
  }
}

function bindBotLogClient(client) {
  activeClient = client;
}

async function sendGuildLog(client, payload) {
  const resolvedClient = client || activeClient;
  const results = await Promise.all([
    sendExternalLog(payload),
    sendUserGuildLog(resolvedClient, payload),
    sendDevLog(resolvedClient, payload)
  ]);

  return results.some(Boolean);
}

async function broadcastGlobalLog(payload) {
  const resolvedClient = activeClient;
  await sendExternalLog(payload);
  await sendDevLog(resolvedClient, payload);

  if (!resolvedClient) {
    return false;
  }

  const data = await readData();
  const guildIds = data.guildSettings
    .filter((item) => item?.guildId && item?.logChannelId)
    .map((item) => item.guildId);

  for (const guildId of guildIds) {
    await sendUserGuildLog(resolvedClient, {
      ...payload,
      guildId
    });
  }

  return guildIds.length > 0;
}

module.exports = {
  bindBotLogClient,
  broadcastGlobalLog,
  sendGuildLog
};
