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
      await interaction.editReply({ embeds: [buildTitleWatchNotFoundEmbed(prefix)] });
      return;
    }

    await interaction.editReply({ embeds: [buildTitleWatchRemovedEmbed(removed, prefix)] });
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
      await message.reply({ embeds: [buildTitleWatchNotFoundEmbed(context.prefix)] });
      return;
    }

    await message.reply({ embeds: [buildTitleWatchRemovedEmbed(removed, context.prefix)] });
  }
};
