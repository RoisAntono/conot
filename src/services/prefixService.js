const { DEFAULT_PREFIX, MAX_PREFIX_LENGTH } = require("../config/constants");
const { getGuildPrefix, setGuildPrefix } = require("../utils/fileDb");

function validatePrefix(prefix) {
  const value = String(prefix || "").trim();

  if (!value) {
    throw new Error("Prefix tidak boleh kosong.");
  }

  if (/\s/.test(value)) {
    throw new Error("Prefix tidak boleh mengandung spasi.");
  }

  if (value.length > MAX_PREFIX_LENGTH) {
    throw new Error(`Prefix maksimal ${MAX_PREFIX_LENGTH} karakter.`);
  }

  return value;
}

async function getPrefixForGuild(guildId) {
  return getGuildPrefix(guildId, DEFAULT_PREFIX);
}

async function updatePrefixForGuild(guildId, prefix) {
  return setGuildPrefix(guildId, validatePrefix(prefix));
}

module.exports = {
  DEFAULT_PREFIX,
  getPrefixForGuild,
  updatePrefixForGuild,
  validatePrefix
};
