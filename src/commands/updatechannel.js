const {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const {
  CONTENT_FILTERS,
  EMBED_LAYOUTS,
  HEAVY_COMMAND_RATE_LIMIT_MS,
  SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS
} = require("../config/constants");
const { getPrefixForGuild } = require("../services/prefixService");
const { updateChannelTracker } = require("../services/trackerService");
const { resolveGuildChannel, resolveGuildRole } = require("../utils/discordResolvers");
const { diagnoseChannelAccess } = require("../utils/discordDeliveryDiagnostics");
const {
  buildTrackerNotFoundEmbed,
  buildTrackerResultEmbed,
  buildValidationErrorEmbed
} = require("../utils/embedFactory");
const { parseTrackerCommandArgs } = require("../utils/trackerCommandParser");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("updatechannel")
    .setDescription("Perbarui target channel, role, filter, atau custom message tracker.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("Handle YouTube atau channel ID yang ingin diperbarui")
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName("discord_channel")
        .setDescription("Channel Discord tujuan baru")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    )
    .addRoleOption((option) =>
      option
        .setName("ping_role")
        .setDescription("Role baru yang akan di-ping")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("remove_ping_role")
        .setDescription("Hapus ping role dari tracker ini")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("content_filter")
        .setDescription("Filter jenis konten yang ingin dinotifikasi")
        .addChoices(
          { name: "Semua Konten", value: CONTENT_FILTERS.ALL },
          { name: "Video Panjang / Upload", value: CONTENT_FILTERS.VIDEO },
          { name: "Shorts", value: CONTENT_FILTERS.SHORTS },
          { name: "Semua Live", value: CONTENT_FILTERS.LIVE },
          { name: "Live Akan Datang", value: CONTENT_FILTERS.LIVE_UPCOMING },
          { name: "Sedang Live", value: CONTENT_FILTERS.LIVE_NOW },
          { name: "Replay Live", value: CONTENT_FILTERS.LIVE_REPLAY },
          { name: "Semua Premiere", value: CONTENT_FILTERS.PREMIERE },
          { name: "Premiere Akan Datang", value: CONTENT_FILTERS.PREMIERE_UPCOMING },
          { name: "Premiere Sudah Tayang", value: CONTENT_FILTERS.PREMIERE_PUBLISHED }
        )
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("custom_message")
        .setDescription("Template baru. Placeholder: {channel} {title} {link} {type}")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("title_filter")
        .setDescription('Keyword judul dipisah koma. Contoh: "Praz Teguh, Habib Jafar"')
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("remove_title_filter")
        .setDescription("Hapus filter judul dari tracker ini")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("refresh_source")
        .setDescription("Refresh ulang channel sumber dari handle (opsional, aman untuk migrasi handle)")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("layout")
        .setDescription("Ubah tampilan embed notifikasi tracker")
        .addChoices(
          { name: "Compact", value: EMBED_LAYOUTS.COMPACT },
          { name: "Rich", value: EMBED_LAYOUTS.RICH }
        )
        .setRequired(false)
    ),
  prefix: {
    name: "updatechannel",
    aliases: ["editchannel", "modifychannel"],
    usage: "updatechannel <username> [#channel] [@role] [all|video|shorts|live|live_upcoming|live_now|live_replay|premiere|premiere_upcoming|premiere_published] --layout <compact|rich> --title \"Praz Teguh, Habib Jafar\" --message \"custom message\" [--clear-title] [--refresh-source]"
  },
  requiredPermissions: PermissionFlagsBits.ManageGuild,
  rateLimitMs: HEAVY_COMMAND_RATE_LIMIT_MS,
  rateLimitBucket: "sensitive_setup",
  rateLimitBucketMs: SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const username = interaction.options.getString("username", true);
    const targetChannel = interaction.options.getChannel("discord_channel");
    const pingRole = interaction.options.getRole("ping_role");
    const removeRole = interaction.options.getBoolean("remove_ping_role") || false;
    const contentFilter = interaction.options.getString("content_filter");
    const customMessage = interaction.options.getString("custom_message") || undefined;
    const titleFilter = interaction.options.getString("title_filter") || undefined;
    const clearTitleFilter = interaction.options.getBoolean("remove_title_filter") || false;
    const refreshSource = interaction.options.getBoolean("refresh_source") || false;
    const embedLayout = interaction.options.getString("layout") || undefined;
    if (targetChannel) {
      const accessDiagnosis = diagnoseChannelAccess(targetChannel, interaction.client.user);
      if (!accessDiagnosis.ok && accessDiagnosis.missingPermissions?.length) {
        await interaction.editReply({
          embeds: [buildValidationErrorEmbed(
            `${accessDiagnosis.cause}\n${accessDiagnosis.solution}`
          )]
        });
        return;
      }
    }

    let result;
    try {
      result = await updateChannelTracker({
        guildId: interaction.guildId,
        username,
        targetChannelId: targetChannel?.id || null,
        roleId: pingRole?.id || null,
        removeRole,
        contentFilter,
        embedLayout,
        customMessage,
        titleFilter,
        clearTitleFilter,
        refreshSource
      });
    } catch (error) {
      if (error?.isValidationError) {
        await interaction.editReply({ embeds: [buildValidationErrorEmbed(error.message)] });
        return;
      }

      throw error;
    }

    const prefix = await getPrefixForGuild(interaction.guildId);

    if (!result) {
      await interaction.editReply({ embeds: [buildTrackerNotFoundEmbed(prefix)] });
      return;
    }

    await interaction.editReply({
      embeds: [
        buildTrackerResultEmbed({
          actionLabel: "diperbarui",
          trackedEntry: result.entry,
          latestVideo: result.latestVideo,
          prefix
        })
      ]
    });
  },
  async executePrefix(message, args, context) {
    const parsed = parseTrackerCommandArgs(args);

    if (!parsed.username) {
      await message.reply({
        embeds: [buildValidationErrorEmbed(`Format: \`${context.prefix} ${this.prefix.usage}\``)]
      });
      return;
    }

    const resolvedChannel = await resolveGuildChannel(message.guild, parsed.rawChannelArg);
    const pingRole = await resolveGuildRole(message.guild, parsed.rawRoleArg);

    if (parsed.rawChannelArg && !resolvedChannel) {
      await message.reply({ embeds: [buildValidationErrorEmbed("Channel Discord tujuan tidak valid.")] });
      return;
    }

    if (parsed.rawRoleArg && !pingRole) {
      await message.reply({ embeds: [buildValidationErrorEmbed("Role yang akan di-ping tidak valid.")] });
      return;
    }

    if (resolvedChannel) {
      const accessDiagnosis = diagnoseChannelAccess(resolvedChannel, message.client.user);
      if (!accessDiagnosis.ok && accessDiagnosis.missingPermissions?.length) {
        await message.reply({
          embeds: [buildValidationErrorEmbed(
            `${accessDiagnosis.cause}\n${accessDiagnosis.solution}`
          )]
        });
        return;
      }
    }

    let result;
    try {
      result = await updateChannelTracker({
        guildId: message.guild.id,
        username: parsed.username,
        targetChannelId: resolvedChannel?.id || null,
        roleId: pingRole?.id || null,
        contentFilter: parsed.contentFilter,
        embedLayout: parsed.embedLayout,
        customMessage: parsed.customMessage,
        titleFilter: parsed.titleFilter,
        clearTitleFilter: parsed.clearTitleFilter,
        refreshSource: parsed.refreshSource
      });
    } catch (error) {
      if (error?.isValidationError) {
        await message.reply({ embeds: [buildValidationErrorEmbed(error.message)] });
        return;
      }

      throw error;
    }

    if (!result) {
      await message.reply({ embeds: [buildTrackerNotFoundEmbed(context.prefix)] });
      return;
    }

    await message.reply({
      embeds: [
        buildTrackerResultEmbed({
          actionLabel: "diperbarui",
          trackedEntry: result.entry,
          latestVideo: result.latestVideo,
          prefix: context.prefix
        })
      ]
    });
  }
};
