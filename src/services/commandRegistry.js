const { REST, Routes } = require("discord.js");
const { getAccessControl, isGuildAuthorized } = require("./accessGuardService");
const logger = require("../utils/logger");

function getGuildRegistrationRoute(applicationId) {
  const rawGuildId = String(process.env.GUILD_ID || "").trim();

  if (!rawGuildId) {
    return null;
  }

  if (!/^\d{10,}$/.test(rawGuildId)) {
    logger.warn(`GUILD_ID "${rawGuildId}" tidak valid. Fallback ke registrasi global.`);
    return null;
  }

  return {
    guildId: rawGuildId,
    route: Routes.applicationGuildCommands(applicationId, rawGuildId)
  };
}

async function registerSlashCommands(client) {
  const commands = [...client.commands.values()].map((command) => command.data.toJSON());
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const guildRegistration = getGuildRegistrationRoute(client.user.id);
  const accessControl = await getAccessControl();

  if (guildRegistration) {
    if (!await isGuildAuthorized(guildRegistration.guildId)) {
      logger.warn(`Slash command tidak didaftarkan ke guild ${guildRegistration.guildId} karena belum masuk whitelist guild.`);
      return;
    }

    await rest.put(guildRegistration.route, { body: commands });
    logger.info(`Slash command terdaftar ke guild ${guildRegistration.guildId}.`);
    return;
  }

  const joinedGuilds = [...client.guilds.cache.values()];
  const targetGuilds = [];

  for (const guild of joinedGuilds) {
    if (!accessControl.guildWhitelistEnabled || await isGuildAuthorized(guild.id)) {
      targetGuilds.push(guild);
      continue;
    }

    logger.info(`Registrasi slash command dilewati untuk guild ${guild.id} (${guild.name}) karena belum di-whitelist.`);
  }

  if (targetGuilds.length) {
    for (const guild of targetGuilds) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commands });
      logger.info(`Slash command terdaftar ke guild ${guild.id} (${guild.name}).`);
    }

    return;
  }

  if (accessControl.guildWhitelistEnabled) {
    logger.warn("Slash command global tidak didaftarkan karena guard guild whitelist sedang aktif dan belum ada guild target yang valid.");
    return;
  }

  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  logger.info("Slash command terdaftar secara global. Propagasi Discord bisa memakan waktu.");
}

module.exports = {
  registerSlashCommands
};
