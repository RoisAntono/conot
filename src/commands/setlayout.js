const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const {
  EMBED_LAYOUTS,
  SETTINGS_COMMAND_RATE_LIMIT_MS,
  SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS
} = require("../config/constants");
const { getPrefixForGuild } = require("../services/prefixService");
const { updateChannelTracker } = require("../services/trackerService");
const { logGuildAction } = require("../services/userActionLogService");
const {
  buildTrackerNotFoundEmbed,
  buildTrackerResultEmbed,
  buildValidationErrorEmbed
} = require("../utils/embedFactory");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setlayout")
    .setDescription("Ubah layout embed notifikasi untuk tracker YouTube tertentu.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("Handle YouTube atau channel ID tracker")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("layout")
        .setDescription("Layout embed yang ingin digunakan")
        .addChoices(
          { name: "Compact", value: EMBED_LAYOUTS.COMPACT },
          { name: "Rich", value: EMBED_LAYOUTS.RICH }
        )
        .setRequired(true)
    ),
  prefix: {
    name: "setlayout",
    aliases: ["layout", "layoutset"],
    usage: "setlayout <username> <compact|rich>"
  },
  requiredPermissions: PermissionFlagsBits.ManageGuild,
  rateLimitMs: SETTINGS_COMMAND_RATE_LIMIT_MS,
  rateLimitBucket: "sensitive_setup",
  rateLimitBucketMs: SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const username = interaction.options.getString("username", true);
    const embedLayout = interaction.options.getString("layout", true);
    const prefix = await getPrefixForGuild(interaction.guildId);

    const result = await updateChannelTracker({
      guildId: interaction.guildId,
      username,
      embedLayout
    });

    if (!result) {
      await interaction.editReply({ embeds: [buildTrackerNotFoundEmbed(prefix, interaction.guildId)] });
      return;
    }

    await interaction.editReply({
      embeds: [
        buildTrackerResultEmbed({
          actionLabel: "layout diperbarui",
          trackedEntry: result.entry,
          latestVideo: result.latestVideo,
          prefix
        })
      ]
    });

    await logGuildAction(interaction.client, {
      guildId: interaction.guildId,
      actor: interaction.user,
      action: "Layout tracker diperbarui",
      description: "Admin mengubah layout embed notifikasi tracker.",
      keyParts: [result.entry.youtube.channelId, embedLayout, interaction.user?.id],
      details: [
        {
          name: "YouTube",
          value: `${result.entry.youtube.title || result.entry.youtube.username} (\`${result.entry.youtube.channelId}\`)`,
          inline: false
        },
        {
          name: "Layout",
          value: `\`${embedLayout}\``,
          inline: true
        }
      ]
    });
  },
  async executePrefix(message, args, context) {
    const username = args[0] || null;
    const embedLayout = (args[1] || "").toLowerCase();

    if (!username || !Object.values(EMBED_LAYOUTS).includes(embedLayout)) {
      await message.reply({
        embeds: [buildValidationErrorEmbed(`Format: \`${context.prefix} ${this.prefix.usage}\``)]
      });
      return;
    }

    const result = await updateChannelTracker({
      guildId: message.guild.id,
      username,
      embedLayout
    });

    if (!result) {
      await message.reply({ embeds: [buildTrackerNotFoundEmbed(context.prefix, message.guild.id)] });
      return;
    }

    await message.reply({
      embeds: [
        buildTrackerResultEmbed({
          actionLabel: "layout diperbarui",
          trackedEntry: result.entry,
          latestVideo: result.latestVideo,
          prefix: context.prefix
        })
      ]
    });

    await logGuildAction(message.client, {
      guildId: message.guild.id,
      actor: message.author,
      action: "Layout tracker diperbarui",
      description: "Admin mengubah layout embed notifikasi tracker.",
      keyParts: [result.entry.youtube.channelId, embedLayout, message.author?.id],
      details: [
        {
          name: "YouTube",
          value: `${result.entry.youtube.title || result.entry.youtube.username} (\`${result.entry.youtube.channelId}\`)`,
          inline: false
        },
        {
          name: "Layout",
          value: `\`${embedLayout}\``,
          inline: true
        }
      ]
    });
  }
};
