const { SlashCommandBuilder } = require("discord.js");
const {
  OWNER_COMMAND_RATE_LIMIT_MS,
  SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS
} = require("../config/constants");
const { enforceGuildWhitelistForClient } = require("../services/accessGuardService");
const { registerSlashCommands } = require("../services/commandRegistry");
const {
  getAccessControl,
  getOwnerUserIds,
  updateAccessControlSettings
} = require("../services/accessGuardService");
const {
  buildAccessGuardStatusEmbed,
  buildValidationErrorEmbed
} = require("../utils/embedFactory");

function parseToggleValue(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["on", "true", "enable", "enabled"].includes(normalized)) {
    return true;
  }

  if (["off", "false", "disable", "disabled"].includes(normalized)) {
    return false;
  }

  return null;
}

function parsePrefixGuardArgs(args) {
  const updates = {};

  for (let index = 0; index < args.length; index += 2) {
    const key = String(args[index] || "").trim().toLowerCase();
    const rawValue = args[index + 1];

    if (!key) {
      continue;
    }

    if (!rawValue) {
      throw new Error(`Nilai untuk \`${key}\` wajib diisi.`);
    }

    const parsedValue = parseToggleValue(rawValue);
    if (parsedValue === null) {
      throw new Error(`Nilai \`${rawValue}\` tidak valid. Gunakan \`on\` atau \`off\`.`);
    }

    if (["guild", "guilds", "guild_whitelist"].includes(key)) {
      updates.guildWhitelistEnabled = parsedValue;
      continue;
    }

    if (["user", "users", "user_whitelist"].includes(key)) {
      updates.userWhitelistEnabled = parsedValue;
      continue;
    }

    if (["leave", "autoleave", "leave_unauthorized"].includes(key)) {
      updates.leaveUnauthorizedGuilds = parsedValue;
      continue;
    }

    throw new Error(`Opsi \`${key}\` tidak dikenali.`);
  }

  return updates;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setguard")
    .setDescription("Atur guard whitelist guild/user untuk instance bot.")
    .addBooleanOption((option) =>
      option
        .setName("guild_whitelist_enabled")
        .setDescription("Aktif/nonaktif guard whitelist guild")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("user_whitelist_enabled")
        .setDescription("Aktif/nonaktif guard whitelist user")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("leave_unauthorized_guilds")
        .setDescription("Keluar otomatis dari guild yang tidak di-whitelist")
        .setRequired(false)
    ),
  prefix: {
    name: "setguard",
    aliases: ["guard", "accessguard"],
    usage: "setguard [guild on|off] [user on|off] [leave on|off]"
  },
  ownerOnly: true,
  rateLimitMs: OWNER_COMMAND_RATE_LIMIT_MS,
  rateLimitBucket: "owner_guard",
  rateLimitBucketMs: SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildWhitelistEnabled = interaction.options.getBoolean("guild_whitelist_enabled");
    const userWhitelistEnabled = interaction.options.getBoolean("user_whitelist_enabled");
    const leaveUnauthorizedGuilds = interaction.options.getBoolean("leave_unauthorized_guilds");

    const hasUpdates = [guildWhitelistEnabled, userWhitelistEnabled, leaveUnauthorizedGuilds].some((value) => value !== null);

    if (hasUpdates) {
      await updateAccessControlSettings({
        ...(guildWhitelistEnabled !== null ? { guildWhitelistEnabled } : {}),
        ...(userWhitelistEnabled !== null ? { userWhitelistEnabled } : {}),
        ...(leaveUnauthorizedGuilds !== null ? { leaveUnauthorizedGuilds } : {})
      });
    }

    const accessControl = await getAccessControl();

    await interaction.editReply({
      embeds: [buildAccessGuardStatusEmbed(accessControl, getOwnerUserIds())]
    });

    if (hasUpdates) {
      await enforceGuildWhitelistForClient(interaction.client).catch(() => null);
      await registerSlashCommands(interaction.client).catch(() => null);
    }
  },
  async executePrefix(message, args, context) {
    let accessControl;

    if (!args.length) {
      accessControl = await getAccessControl();
      await message.reply({
        embeds: [buildAccessGuardStatusEmbed(accessControl, getOwnerUserIds())]
      });
      return;
    }

    try {
      const updates = parsePrefixGuardArgs(args);
      if (!Object.keys(updates).length) {
        await message.reply({
          embeds: [buildValidationErrorEmbed(`Format: \`${context.prefix} ${this.prefix.usage}\``)]
        });
        return;
      }

      await updateAccessControlSettings(updates);
      accessControl = await getAccessControl();
    } catch (error) {
      await message.reply({
        embeds: [buildValidationErrorEmbed(error.message)]
      });
      return;
    }

    await message.reply({
      embeds: [buildAccessGuardStatusEmbed(accessControl, getOwnerUserIds())]
    });

    await enforceGuildWhitelistForClient(message.client).catch(() => null);
    await registerSlashCommands(message.client).catch(() => null);
  }
};
