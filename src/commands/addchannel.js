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
const { getPreviewOnAddForGuild } = require("../services/previewService");
const { addChannelTracker } = require("../services/trackerService");
const { resolveGuildChannel, resolveGuildRole } = require("../utils/discordResolvers");
const { diagnoseChannelAccess } = require("../utils/discordDeliveryDiagnostics");
const {
  buildTrackerResultEmbed,
  buildValidationErrorEmbed
} = require("../utils/embedFactory");
const { sendTrackerSetupPreview } = require("../utils/setupPreview");
const { parseTrackerCommandArgs } = require("../utils/trackerCommandParser");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("addchannel")
    .setDescription("Tambah channel YouTube untuk dipantau.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("Handle YouTube. Contoh: @windahbasudara")
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName("discord_channel")
        .setDescription("Channel Discord tujuan notifikasi")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addRoleOption((option) =>
      option
        .setName("ping_role")
        .setDescription("Role yang akan di-ping saat ada video baru")
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
        .setDescription("Template custom. Placeholder: {channel} {title} {link} {type}")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("title_filter")
        .setDescription('Keyword judul dipisah koma. Contoh: "Praz Teguh, Habib Jafar"')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("layout")
        .setDescription("Pilih tampilan embed notifikasi")
        .addChoices(
          { name: "Compact", value: EMBED_LAYOUTS.COMPACT },
          { name: "Rich", value: EMBED_LAYOUTS.RICH }
        )
        .setRequired(false)
    ),
  prefix: {
    name: "addchannel",
    aliases: ["addyt", "trackyt"],
    usage: "addchannel <username> [#channel] [@role] [all|video|shorts|live|live_upcoming|live_now|live_replay|premiere|premiere_upcoming|premiere_published] --layout <compact|rich> --title \"Praz Teguh, Habib Jafar\" --message \"custom message\""
  },
  requiredPermissions: PermissionFlagsBits.ManageGuild,
  rateLimitMs: HEAVY_COMMAND_RATE_LIMIT_MS,
  rateLimitBucket: "sensitive_setup",
  rateLimitBucketMs: SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const username = interaction.options.getString("username", true);
    const targetChannel = interaction.options.getChannel("discord_channel", true);
    const pingRole = interaction.options.getRole("ping_role");
    const contentFilter = interaction.options.getString("content_filter");
    const customMessage = interaction.options.getString("custom_message") || undefined;
    const titleFilter = interaction.options.getString("title_filter") || undefined;
    const embedLayout = interaction.options.getString("layout") || undefined;
    const accessDiagnosis = diagnoseChannelAccess(targetChannel, interaction.client.user);

    if (!accessDiagnosis.ok && accessDiagnosis.missingPermissions?.length) {
      await interaction.editReply({
        embeds: [buildValidationErrorEmbed(
          `${accessDiagnosis.cause}\n${accessDiagnosis.solution}`
        )]
      });
      return;
    }

    let result;
    try {
      result = await addChannelTracker({
        guildId: interaction.guildId,
        username,
        targetChannelId: targetChannel.id,
        roleId: pingRole?.id || null,
        contentFilter,
        customMessage,
        titleFilter,
        embedLayout
      });
    } catch (error) {
      if (error?.isValidationError) {
        await interaction.editReply({ embeds: [buildValidationErrorEmbed(error.message)] });
        return;
      }

      throw error;
    }

    const prefix = await getPrefixForGuild(interaction.guildId);
    const embed = buildTrackerResultEmbed({
      actionLabel: result.isNew ? "ditambahkan" : "diperbarui",
      trackedEntry: result.entry,
      latestVideo: result.latestVideo,
      prefix
    });

    if (result.isNew) {
      const previewOnAdd = await getPreviewOnAddForGuild(interaction.guildId);
      const preview = previewOnAdd
        ? await sendTrackerSetupPreview(targetChannel, result.entry, result.latestVideo)
        : { sent: false, reason: "Setup preview dimatikan untuk server ini." };
      embed.addFields({
        name: "Setup Test",
        value: preview.reason,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });
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
    const targetChannel = resolvedChannel || message.channel;
    const pingRole = await resolveGuildRole(message.guild, parsed.rawRoleArg);

    if (parsed.rawChannelArg && !resolvedChannel) {
      await message.reply({ embeds: [buildValidationErrorEmbed("Channel Discord tujuan tidak valid.")] });
      return;
    }

    if (parsed.rawRoleArg && !pingRole) {
      await message.reply({ embeds: [buildValidationErrorEmbed("Role yang akan di-ping tidak valid.")] });
      return;
    }

    const accessDiagnosis = diagnoseChannelAccess(targetChannel, message.client.user);
    if (!accessDiagnosis.ok && accessDiagnosis.missingPermissions?.length) {
      await message.reply({
        embeds: [buildValidationErrorEmbed(
          `${accessDiagnosis.cause}\n${accessDiagnosis.solution}`
        )]
      });
      return;
    }

    let result;
    try {
      result = await addChannelTracker({
        guildId: message.guild.id,
        username: parsed.username,
        targetChannelId: targetChannel.id,
        roleId: pingRole?.id || null,
        contentFilter: parsed.contentFilter,
        customMessage: parsed.customMessage,
        titleFilter: parsed.titleFilter,
        embedLayout: parsed.embedLayout
      });
    } catch (error) {
      if (error?.isValidationError) {
        await message.reply({ embeds: [buildValidationErrorEmbed(error.message)] });
        return;
      }

      throw error;
    }

    const embed = buildTrackerResultEmbed({
      actionLabel: result.isNew ? "ditambahkan" : "diperbarui",
      trackedEntry: result.entry,
      latestVideo: result.latestVideo,
      prefix: context.prefix
    });

    if (result.isNew) {
      const previewOnAdd = await getPreviewOnAddForGuild(message.guild.id);
      const preview = previewOnAdd
        ? await sendTrackerSetupPreview(targetChannel, result.entry, result.latestVideo)
        : { sent: false, reason: "Setup preview dimatikan untuk server ini." };
      embed.addFields({
        name: "Setup Test",
        value: preview.reason,
        inline: false
      });
    }

    await message.reply({ embeds: [embed] });
  }
};
