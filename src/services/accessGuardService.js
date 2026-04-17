const {
  DEFAULT_GUILD_WHITELIST_ENABLED,
  DEFAULT_LEAVE_UNAUTHORIZED_GUILDS,
  DEFAULT_USER_WHITELIST_ENABLED
} = require("../config/constants");
const {
  addGlobalWhitelistGuildId,
  addGlobalWhitelistUserId,
  getGlobalAccessControl,
  removeGlobalWhitelistGuildId,
  removeGlobalWhitelistUserId,
  setGlobalAccessControl
} = require("../utils/fileDb");
const logger = require("../utils/logger");

function parseIdList(value) {
  return [...new Set(String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^\d{10,}$/.test(item)))];
}

function parseOptionalBooleanEnv(name) {
  const rawValue = String(process.env[name] || "").trim().toLowerCase();

  if (!rawValue) {
    return null;
  }

  if (["1", "true", "yes", "on"].includes(rawValue)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(rawValue)) {
    return false;
  }

  return null;
}

function getOwnerUserIds() {
  return [...new Set([
    ...parseIdList(process.env.BOT_OWNER_IDS),
    ...parseIdList(process.env.OWNER_USER_IDS)
  ])];
}

function normalizeAccessControl(accessControl) {
  return {
    guildWhitelistEnabled: Boolean(accessControl?.guildWhitelistEnabled ?? DEFAULT_GUILD_WHITELIST_ENABLED),
    userWhitelistEnabled: Boolean(accessControl?.userWhitelistEnabled ?? DEFAULT_USER_WHITELIST_ENABLED),
    leaveUnauthorizedGuilds: Boolean(accessControl?.leaveUnauthorizedGuilds ?? DEFAULT_LEAVE_UNAUTHORIZED_GUILDS),
    whitelistGuildIds: [...new Set(accessControl?.whitelistGuildIds || [])],
    whitelistUserIds: [...new Set(accessControl?.whitelistUserIds || [])]
  };
}

function isOwnerUser(userId) {
  return getOwnerUserIds().includes(String(userId || "").trim());
}

function isGuildAuthorizedByControl(accessControl, guildId) {
  const normalized = normalizeAccessControl(accessControl);

  if (!normalized.guildWhitelistEnabled) {
    return true;
  }

  return normalized.whitelistGuildIds.includes(String(guildId || "").trim());
}

function isUserAuthorizedByControl(accessControl, userId) {
  const normalized = normalizeAccessControl(accessControl);
  const normalizedUserId = String(userId || "").trim();

  if (!normalizedUserId) {
    return false;
  }

  if (isOwnerUser(normalizedUserId)) {
    return true;
  }

  if (!normalized.userWhitelistEnabled) {
    return true;
  }

  return normalized.whitelistUserIds.includes(normalizedUserId);
}

async function getAccessControl() {
  const stored = await getGlobalAccessControl();
  const ownerUserIds = getOwnerUserIds();
  const envWhitelistGuildIds = [
    ...parseIdList(process.env.GUARD_GUILD_IDS),
    ...parseIdList(process.env.WHITELIST_GUILD_IDS)
  ];
  const envWhitelistUserIds = [
    ...parseIdList(process.env.GUARD_USER_IDS),
    ...parseIdList(process.env.WHITELIST_USER_IDS)
  ];

  return normalizeAccessControl({
    guildWhitelistEnabled: parseOptionalBooleanEnv("GUARD_GUILD_WHITELIST_ENABLED")
      ?? stored.guildWhitelistEnabled
      ?? DEFAULT_GUILD_WHITELIST_ENABLED,
    userWhitelistEnabled: parseOptionalBooleanEnv("GUARD_USER_WHITELIST_ENABLED")
      ?? stored.userWhitelistEnabled
      ?? DEFAULT_USER_WHITELIST_ENABLED,
    leaveUnauthorizedGuilds: parseOptionalBooleanEnv("GUARD_LEAVE_UNAUTHORIZED_GUILDS")
      ?? stored.leaveUnauthorizedGuilds
      ?? DEFAULT_LEAVE_UNAUTHORIZED_GUILDS,
    whitelistGuildIds: [...stored.whitelistGuildIds, ...envWhitelistGuildIds],
    whitelistUserIds: [...stored.whitelistUserIds, ...envWhitelistUserIds, ...ownerUserIds]
  });
}

async function evaluateAccess({ guildId, userId }) {
  const accessControl = await getAccessControl();

  if (isOwnerUser(userId)) {
    return {
      allowed: true,
      reason: null,
      accessControl
    };
  }

  if (!isGuildAuthorizedByControl(accessControl, guildId)) {
    return {
      allowed: false,
      reason: "guild_not_whitelisted",
      accessControl
    };
  }

  if (!isUserAuthorizedByControl(accessControl, userId)) {
    return {
      allowed: false,
      reason: "user_not_whitelisted",
      accessControl
    };
  }

  return {
    allowed: true,
    reason: null,
    accessControl
  };
}

async function isGuildAuthorized(guildId) {
  const accessControl = await getAccessControl();
  return isGuildAuthorizedByControl(accessControl, guildId);
}

async function updateAccessControlSettings(partial = {}) {
  return setGlobalAccessControl(partial);
}

async function whitelistGuild(guildId) {
  return addGlobalWhitelistGuildId(guildId);
}

async function unwhitelistGuild(guildId) {
  return removeGlobalWhitelistGuildId(guildId);
}

async function whitelistUser(userId) {
  return addGlobalWhitelistUserId(userId);
}

async function unwhitelistUser(userId) {
  return removeGlobalWhitelistUserId(userId);
}

async function enforceGuildJoinPolicy(client, guild) {
  const accessControl = await getAccessControl();

  if (!accessControl.guildWhitelistEnabled || !accessControl.leaveUnauthorizedGuilds) {
    return false;
  }

  if (isGuildAuthorizedByControl(accessControl, guild.id)) {
    return false;
  }

  logger.warn(`Guild ${guild.id} (${guild.name}) tidak ada di whitelist. Bot akan keluar otomatis.`);
  await guild.leave().catch((error) => {
    logger.error(`Gagal keluar dari guild ${guild.id} (${guild.name}) yang tidak di-whitelist.`, error);
  });
  return true;
}

async function enforceGuildWhitelistForClient(client) {
  for (const guild of client.guilds.cache.values()) {
    await enforceGuildJoinPolicy(client, guild);
  }
}

module.exports = {
  enforceGuildJoinPolicy,
  enforceGuildWhitelistForClient,
  evaluateAccess,
  getAccessControl,
  getOwnerUserIds,
  isGuildAuthorized,
  isGuildAuthorizedByControl,
  isOwnerUser,
  updateAccessControlSettings,
  unwhitelistGuild,
  unwhitelistUser,
  whitelistGuild,
  whitelistUser
};
