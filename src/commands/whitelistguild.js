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
  unwhitelistGuild,
  whitelistGuild
} = require("../services/accessGuardService");
const {
  buildAccessGuardStatusEmbed,
  buildValidationErrorEmbed,
  buildWhitelistUpdatedEmbed
} = require("../utils/embedFactory");

function normalizeGuildId(rawValue, fallbackGuildId = null) {
  const value = String(rawValue || fallbackGuildId || "").trim();
  return /^\d{10,}$/.test(value) ? value : null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("whitelistguild")
    .setDescription("Tambah, hapus, atau lihat whitelist guild untuk instance bot.")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Aksi yang ingin dilakukan")
        .addChoices(
          { name: "Add", value: "add" },
          { name: "Remove", value: "remove" },
          { name: "List", value: "list" }
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("guild_id")
        .setDescription("Guild ID target. Kosongkan untuk memakai guild saat ini.")
        .setRequired(false)
    ),
  prefix: {
    name: "whitelistguild",
    aliases: ["guildwhitelist"],
    usage: "whitelistguild <add|remove|list> [guildId]"
  },
  ownerOnly: true,
  rateLimitMs: OWNER_COMMAND_RATE_LIMIT_MS,
  rateLimitBucket: "owner_guard",
  rateLimitBucketMs: SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const action = interaction.options.getString("action", true);
    const guildId = normalizeGuildId(
      interaction.options.getString("guild_id"),
      action === "list" ? null : interaction.guildId
    );

    if (action !== "list" && !guildId) {
      await interaction.editReply({
        embeds: [buildValidationErrorEmbed("Guild ID tidak valid.")]
      });
      return;
    }

    if (action === "list") {
      const accessControl = await getAccessControl();
      await interaction.editReply({
        embeds: [buildAccessGuardStatusEmbed(accessControl, getOwnerUserIds())]
      });
      return;
    }

    if (action === "add") {
      await whitelistGuild(guildId);
    } else {
      await unwhitelistGuild(guildId);
    }

    const accessControl = await getAccessControl();

    await interaction.editReply({
      embeds: [buildWhitelistUpdatedEmbed({ type: "guild", action, targetId: guildId, accessControl })]
    });

    await enforceGuildWhitelistForClient(interaction.client).catch(() => null);
    await registerSlashCommands(interaction.client).catch(() => null);
  },
  async executePrefix(message, args, context) {
    const action = String(args[0] || "").trim().toLowerCase();

    if (!action) {
      await message.reply({
        embeds: [buildValidationErrorEmbed(`Format: \`${context.prefix} ${this.prefix.usage}\``)]
      });
      return;
    }

    if (action === "list") {
      const accessControl = await getAccessControl();
      await message.reply({
        embeds: [buildAccessGuardStatusEmbed(accessControl, getOwnerUserIds())]
      });
      return;
    }

    if (!["add", "remove"].includes(action)) {
      await message.reply({
        embeds: [buildValidationErrorEmbed("Aksi tidak valid. Gunakan `add`, `remove`, atau `list`.")]
      });
      return;
    }

    const guildId = normalizeGuildId(args[1], message.guild.id);
    if (!guildId) {
      await message.reply({
        embeds: [buildValidationErrorEmbed("Guild ID tidak valid.")]
      });
      return;
    }

    if (action === "add") {
      await whitelistGuild(guildId);
    } else {
      await unwhitelistGuild(guildId);
    }

    const accessControl = await getAccessControl();

    await message.reply({
      embeds: [buildWhitelistUpdatedEmbed({ type: "guild", action, targetId: guildId, accessControl })]
    });

    await enforceGuildWhitelistForClient(message.client).catch(() => null);
    await registerSlashCommands(message.client).catch(() => null);
  }
};
