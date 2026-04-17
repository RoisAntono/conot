const {
  getGlobalLoggingSettings,
  getGuildLogChannelId,
  getGuildLogLevel,
  setGlobalLoggingSettings,
  setGuildLogChannelId
} = require("../utils/fileDb");

async function getLogChannelIdForGuild(guildId) {
  return getGuildLogChannelId(guildId);
}

async function updateLogChannelForGuild(guildId, logChannelId) {
  return setGuildLogChannelId(guildId, logChannelId || null);
}

async function getLogLevelForGuild(guildId) {
  return getGuildLogLevel(guildId);
}

async function getDevLogSettings() {
  return getGlobalLoggingSettings();
}

async function updateDevLogSettings(overrides = {}) {
  return setGlobalLoggingSettings(overrides);
}

module.exports = {
  getLogChannelIdForGuild,
  getLogLevelForGuild,
  getDevLogSettings,
  updateDevLogSettings,
  updateLogChannelForGuild
};
