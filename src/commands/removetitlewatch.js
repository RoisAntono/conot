const {
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const {
  SETTINGS_COMMAND_RATE_LIMIT_MS,
  SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS
} = require("../config/constants");
const { getPrefixForGuild } = require("../services/prefixService");
const { deleteTitleWatch } = require("../services/titleWatchService");
const { logGuildAction } = require("../services/userActionLogService");
const {
  buildTitleWatchNotFoundEmbed,
  buildTitleWatchRemovedEmbed,
  buildValidationErrorEmbed
} = require("../utils/embedFactory");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("removetitlewatch")
    .setDescription("Hapus keyword title watch global.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("keyword")
        .setDescription('Keyword judul yang ingin dihapus. Contoh: "Frimawan"')
        .setRequired(true)
    ),
  prefix: {
    name: "removetitlewatch",
    aliases: ["rmtitlewatch", "titlewatchremove"],
    usage: "removetitlewatch <keyword...>"
  },
  requiredPermissions: PermissionFlagsBits.ManageGuild,
  rateLimitMs: SETTINGS_COMMAND_RATE_LIMIT_MS,
  rateLimitBucket: "sensitive_setup",
  rateLimitBucketMs: SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const prefix = await getPrefixForGuild(interaction.guildId);
    const removed = await deleteTitleWatch(interaction.guildId, interaction.options.getString("keyword", true));

    if (!removed) {
      await interaction.editReply({ embeds: [buildTitleWatchNotFoundEmbed(prefix, interaction.guildId)] });
      return;
    }

    await interaction.editReply({ embeds: [buildTitleWatchRemovedEmbed(removed, prefix, interaction.guildId)] });

    await logGuildAction(interaction.client, {
      guildId: interaction.guildId,
      actor: interaction.user,
      action: "Title watch dihapus",
      description: "Admin menghapus keyword title watch.",
      keyParts: [removed.keyword, interaction.user?.id],
      details: [
        {
          name: "Keyword",
          value: `\`${removed.keyword}\``,
          inline: true
        },
        {
          name: "Target Channel",
          value: `<#${removed.channelId}>`,
          inline: true
        }
      ]
    });
  },
  async executePrefix(message, args, context) {
    const keyword = args.join(" ").trim();

    if (!keyword) {
      await message.reply({
        embeds: [buildValidationErrorEmbed(`Format: \`${context.prefix} ${this.prefix.usage}\``)]
      });
      return;
    }

    const removed = await deleteTitleWatch(message.guild.id, keyword);

    if (!removed) {
      await message.reply({ embeds: [buildTitleWatchNotFoundEmbed(context.prefix, message.guild.id)] });
      return;
    }

    await message.reply({ embeds: [buildTitleWatchRemovedEmbed(removed, context.prefix, message.guild.id)] });

    await logGuildAction(message.client, {
      guildId: message.guild.id,
      actor: message.author,
      action: "Title watch dihapus",
      description: "Admin menghapus keyword title watch.",
      keyParts: [removed.keyword, message.author?.id],
      details: [
        {
          name: "Keyword",
          value: `\`${removed.keyword}\``,
          inline: true
        },
        {
          name: "Target Channel",
          value: `<#${removed.channelId}>`,
          inline: true
        }
      ]
    });
  }
};
