const { DEFAULT_PREVIEW_ON_ADD } = require("../config/constants");
const { getGuildPreviewOnAdd, setGuildPreviewOnAdd } = require("../utils/fileDb");

async function getPreviewOnAddForGuild(guildId) {
  return getGuildPreviewOnAdd(guildId, DEFAULT_PREVIEW_ON_ADD);
}

async function updatePreviewOnAddForGuild(guildId, value) {
  return setGuildPreviewOnAdd(guildId, Boolean(value));
}

module.exports = {
  getPreviewOnAddForGuild,
  updatePreviewOnAddForGuild
};
