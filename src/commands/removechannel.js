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
const { logGuildAction } = require("../services/userActionLogService");
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
      await interaction.editReply({ embeds: [buildTrackerNotFoundEmbed(prefix, interaction.guildId)] });
      return;
    }

    await interaction.editReply({ embeds: [buildTrackerRemovedEmbed(removed, prefix)] });

    await logGuildAction(interaction.client, {
      guildId: interaction.guildId,
      actor: interaction.user,
      action: "Tracker dihapus",
      description: "Admin menghapus tracker YouTube dari server.",
      keyParts: [removed.youtube?.channelId, interaction.user?.id],
      details: [
        {
          name: "YouTube",
          value: `${removed.youtube?.title || removed.youtube?.username} (\`${removed.youtube?.channelId}\`)`,
          inline: false
        }
      ]
    });
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
      await message.reply({ embeds: [buildTrackerNotFoundEmbed(context.prefix, message.guild.id)] });
      return;
    }

    await message.reply({ embeds: [buildTrackerRemovedEmbed(removed, context.prefix)] });

    await logGuildAction(message.client, {
      guildId: message.guild.id,
      actor: message.author,
      action: "Tracker dihapus",
      description: "Admin menghapus tracker YouTube dari server.",
      keyParts: [removed.youtube?.channelId, message.author?.id],
      details: [
        {
          name: "YouTube",
          value: `${removed.youtube?.title || removed.youtube?.username} (\`${removed.youtube?.channelId}\`)`,
          inline: false
        }
      ]
    });
  }
};
