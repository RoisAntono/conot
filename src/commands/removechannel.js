const {
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const {
  SETTINGS_COMMAND_RATE_LIMIT_MS,
  SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS
} = require("../config/constants");
const { getPrefixForGuild } = require("../services/prefixService");
const { removeChannelTracker } = require("../services/trackerService");
const {
  buildTrackerNotFoundEmbed,
  buildTrackerRemovedEmbed,
  buildValidationErrorEmbed
} = require("../utils/embedFactory");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("removechannel")
    .setDescription("Hapus channel YouTube dari daftar pantauan.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("Handle YouTube atau channel ID yang ingin dihapus")
        .setRequired(true)
    ),
  prefix: {
    name: "removechannel",
    aliases: ["rmchannel", "untrackyt"],
    usage: "removechannel <username|channelId>"
  },
  requiredPermissions: PermissionFlagsBits.ManageGuild,
  rateLimitMs: SETTINGS_COMMAND_RATE_LIMIT_MS,
  rateLimitBucket: "sensitive_setup",
  rateLimitBucketMs: SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const prefix = await getPrefixForGuild(interaction.guildId);
    const username = interaction.options.getString("username", true);
    const removed = await removeChannelTracker(interaction.guildId, username);

    if (!removed) {
      await interaction.editReply({ embeds: [buildTrackerNotFoundEmbed(prefix)] });
      return;
    }

    await interaction.editReply({ embeds: [buildTrackerRemovedEmbed(removed, prefix)] });
  },
  async executePrefix(message, args, context) {
    const username = args[0];

    if (!username) {
      await message.reply({
        embeds: [buildValidationErrorEmbed(`Format: \`${context.prefix} ${this.prefix.usage}\``)]
      });
      return;
    }

    const removed = await removeChannelTracker(message.guild.id, username);

    if (!removed) {
      await message.reply({ embeds: [buildTrackerNotFoundEmbed(context.prefix)] });
      return;
    }

    await message.reply({ embeds: [buildTrackerRemovedEmbed(removed, context.prefix)] });
  }
};
