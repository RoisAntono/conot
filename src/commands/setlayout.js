const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const {
  EMBED_LAYOUTS,
  SETTINGS_COMMAND_RATE_LIMIT_MS,
  SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS
} = require("../config/constants");
const { getPrefixForGuild } = require("../services/prefixService");
const { updateChannelTracker } = require("../services/trackerService");
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
      await interaction.editReply({ embeds: [buildTrackerNotFoundEmbed(prefix)] });
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
      await message.reply({ embeds: [buildTrackerNotFoundEmbed(context.prefix)] });
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
  }
};
