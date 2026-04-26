const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const {
  SETTINGS_COMMAND_RATE_LIMIT_MS,
  SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS
} = require("../config/constants");
const { DEFAULT_PREFIX, getPrefixForGuild, updatePrefixForGuild } = require("../services/prefixService");
const { logGuildAction } = require("../services/userActionLogService");
const {
  buildPrefixUpdatedEmbed,
  buildValidationErrorEmbed
} = require("../utils/embedFactory");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setprefix")
    .setDescription("Ubah prefix command bot untuk server ini.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("prefix")
        .setDescription("Prefix baru. Contoh: ! atau ?n")
        .setRequired(true)
    ),
  prefix: {
    name: "setprefix",
    aliases: ["prefix"],
    usage: "setprefix <prefix>"
  },
  requiredPermissions: PermissionFlagsBits.ManageGuild,
  rateLimitMs: SETTINGS_COMMAND_RATE_LIMIT_MS,
  rateLimitBucket: "sensitive_setup",
  rateLimitBucketMs: SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const prefix = interaction.options.getString("prefix", true);
    const currentPrefix = await getPrefixForGuild(interaction.guildId);
    const updated = await updatePrefixForGuild(interaction.guildId, prefix);

    await interaction.editReply({
      embeds: [
        buildPrefixUpdatedEmbed({
          oldPrefix: currentPrefix || DEFAULT_PREFIX,
          newPrefix: updated.prefix,
          guildId: interaction.guildId
        })
      ]
    });

    await logGuildAction(interaction.client, {
      guildId: interaction.guildId,
      actor: interaction.user,
      action: "Prefix diperbarui",
      description: "Admin mengubah prefix command server.",
      keyParts: [updated.prefix, interaction.user?.id],
      details: [
        {
          name: "Prefix Lama",
          value: `\`${currentPrefix || DEFAULT_PREFIX}\``,
          inline: true
        },
        {
          name: "Prefix Baru",
          value: `\`${updated.prefix}\``,
          inline: true
        }
      ]
    });
  },
  async executePrefix(message, args, context) {
    const nextPrefix = args[0];

    if (!nextPrefix) {
      await message.reply({
        embeds: [buildValidationErrorEmbed(`Format: \`${context.prefix} ${this.prefix.usage}\``)]
      });
      return;
    }

    const currentPrefix = await getPrefixForGuild(message.guild.id);
    const updated = await updatePrefixForGuild(message.guild.id, nextPrefix);

    await message.reply({
      embeds: [
        buildPrefixUpdatedEmbed({
          oldPrefix: currentPrefix || DEFAULT_PREFIX,
          newPrefix: updated.prefix,
          guildId: message.guild.id
        })
      ]
    });

    await logGuildAction(message.client, {
      guildId: message.guild.id,
      actor: message.author,
      action: "Prefix diperbarui",
      description: "Admin mengubah prefix command server.",
      keyParts: [updated.prefix, message.author?.id],
      details: [
        {
          name: "Prefix Lama",
          value: `\`${currentPrefix || DEFAULT_PREFIX}\``,
          inline: true
        },
        {
          name: "Prefix Baru",
          value: `\`${updated.prefix}\``,
          inline: true
        }
      ]
    });
  }
};
