const {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const {
  DEFAULT_TITLE_WATCH_MAX_AGE_DAYS,
  HEAVY_COMMAND_RATE_LIMIT_MS,
  MAX_TITLE_WATCH_MAX_AGE_DAYS,
  SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS
} = require("../config/constants");
const { getPrefixForGuild } = require("../services/prefixService");
const { getPreviewOnAddForGuild } = require("../services/previewService");
const {
  addTitleWatch,
  normalizeTitleWatchMaxAgeDays
} = require("../services/titleWatchService");
const { resolveGuildChannel, resolveGuildRole } = require("../utils/discordResolvers");
const { diagnoseChannelAccess } = require("../utils/discordDeliveryDiagnostics");
const {
  buildTitleWatchResultEmbed,
  buildValidationErrorEmbed
} = require("../utils/embedFactory");
const { updateTitleWatchLastVideo } = require("../utils/fileDb");
const logger = require("../utils/logger");
const {
  findTitleWatchSetupPreviewCandidate,
  sendTitleWatchSetupPreview
} = require("../utils/setupPreview");

function parsePrefixTitleWatchOptions(rawArgs) {
  const args = [...rawArgs];
  let maxAgeDays = null;

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (current === "--days" || current === "--max-days") {
      const nextValue = args[index + 1];
      if (!nextValue) {
        throw new Error("Nilai `--days` wajib diisi.");
      }

      maxAgeDays = normalizeTitleWatchMaxAgeDays(nextValue);
      args.splice(index, 2);
      index -= 1;
      continue;
    }

    const inlineMatch = current.match(/^--(?:days|max-days)=(\d+)$/);
    if (inlineMatch) {
      maxAgeDays = normalizeTitleWatchMaxAgeDays(inlineMatch[1]);
      args.splice(index, 1);
      index -= 1;
    }
  }

  return {
    args,
    maxAgeDays
  };
}

async function prepareTitleWatchBaseline(guildId, keyword, maxAgeDays) {
  try {
    const candidate = await findTitleWatchSetupPreviewCandidate(keyword, maxAgeDays);

    if (candidate?.recentVideoIds?.length) {
      await updateTitleWatchLastVideo(
        guildId,
        keyword,
        candidate.latestVideo?.videoId || null,
        candidate.recentVideoIds
      );
    }

    return candidate;
  } catch (error) {
    logger.warn(`Gagal menyiapkan baseline title watch untuk keyword "${keyword}".`, error);
    return null;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("addtitlewatch")
    .setDescription("Pantau keyword judul global dari hasil pencarian YouTube.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("keyword")
        .setDescription('Keyword judul. Contoh: "Frimawan"')
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName("discord_channel")
        .setDescription("Channel Discord tujuan notifikasi keyword")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addRoleOption((option) =>
      option
        .setName("ping_role")
        .setDescription("Role opsional yang akan di-ping")
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName("max_age_days")
        .setDescription(`Batasi hanya hasil yang usianya maksimal sekian hari. Default ${DEFAULT_TITLE_WATCH_MAX_AGE_DAYS} hari.`)
        .setMinValue(1)
        .setMaxValue(MAX_TITLE_WATCH_MAX_AGE_DAYS)
        .setRequired(false)
    ),
  prefix: {
    name: "addtitlewatch",
    aliases: ["titlewatchadd", "watchtitle"],
    usage: `addtitlewatch <keyword...> <#channel> [@role] [--days ${DEFAULT_TITLE_WATCH_MAX_AGE_DAYS}]`
  },
  requiredPermissions: PermissionFlagsBits.ManageGuild,
  rateLimitMs: HEAVY_COMMAND_RATE_LIMIT_MS,
  rateLimitBucket: "sensitive_setup",
  rateLimitBucketMs: SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const keyword = interaction.options.getString("keyword", true);
    const discordChannel = interaction.options.getChannel("discord_channel", true);
    const pingRole = interaction.options.getRole("ping_role");
    const maxAgeDays = interaction.options.getInteger("max_age_days") ?? undefined;
    const accessDiagnosis = diagnoseChannelAccess(discordChannel, interaction.client.user);

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
      result = await addTitleWatch({
        guildId: interaction.guildId,
        keyword,
        channelId: discordChannel.id,
        roleId: pingRole?.id || null,
        maxAgeDays
      });
    } catch (error) {
      if (error?.isValidationError) {
        await interaction.editReply({ embeds: [buildValidationErrorEmbed(error.message)] });
        return;
      }

      throw error;
    }

    const prefix = await getPrefixForGuild(interaction.guildId);
    const embed = buildTitleWatchResultEmbed({
      actionLabel: result.isNew ? "ditambahkan" : "diperbarui",
      watch: result.watch,
      prefix
    });

    if (result.isNew) {
      const previewOnAdd = await getPreviewOnAddForGuild(interaction.guildId);
      const candidate = await prepareTitleWatchBaseline(
        interaction.guildId,
        result.watch.keyword,
        result.watch.maxAgeDays
      );
      const preview = previewOnAdd
        ? await (async () => {
            const setupPreview = await sendTitleWatchSetupPreview(
              discordChannel,
              result.watch,
              candidate?.trackedChannel || null,
              candidate?.latestVideo || null
            );

            return setupPreview;
          })()
        : {
            sent: false,
            reason: [
              "**Status:** Preview otomatis nonaktif",
              "Server ini mematikan setup preview saat addtitlewatch."
            ].join("\n")
          };

      embed.addFields({
        name: "Status Setup Preview",
        value: preview.reason,
        inline: false
      });
    }

    await interaction.editReply({
      embeds: [embed]
    });
  },
  async executePrefix(message, args, context) {
    let parsedOptions;

    try {
      parsedOptions = parsePrefixTitleWatchOptions(args);
    } catch (error) {
      await message.reply({ embeds: [buildValidationErrorEmbed(error.message)] });
      return;
    }

    const rawArgs = [...parsedOptions.args];
    let rawRoleArg = null;

    if (/^<@&[0-9]+>$/.test(rawArgs[rawArgs.length - 1] || "")) {
      rawRoleArg = rawArgs.pop();
    }

    const rawChannelArg = rawArgs.pop() || null;
    const keyword = rawArgs.join(" ").trim();

    if (!keyword || !rawChannelArg) {
      await message.reply({
        embeds: [buildValidationErrorEmbed(`Format: \`${context.prefix} ${this.prefix.usage}\``)]
      });
      return;
    }

    const discordChannel = await resolveGuildChannel(message.guild, rawChannelArg);
    const pingRole = await resolveGuildRole(message.guild, rawRoleArg);

    if (!discordChannel) {
      await message.reply({ embeds: [buildValidationErrorEmbed("Channel Discord tujuan tidak valid.")] });
      return;
    }

    if (rawRoleArg && !pingRole) {
      await message.reply({ embeds: [buildValidationErrorEmbed("Role yang akan di-ping tidak valid.")] });
      return;
    }

    const accessDiagnosis = diagnoseChannelAccess(discordChannel, message.client.user);
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
      result = await addTitleWatch({
        guildId: message.guild.id,
        keyword,
        channelId: discordChannel.id,
        roleId: pingRole?.id || null,
        maxAgeDays: parsedOptions.maxAgeDays ?? undefined
      });
    } catch (error) {
      if (error?.isValidationError) {
        await message.reply({ embeds: [buildValidationErrorEmbed(error.message)] });
        return;
      }

      throw error;
    }

    const embed = buildTitleWatchResultEmbed({
      actionLabel: result.isNew ? "ditambahkan" : "diperbarui",
      watch: result.watch,
      prefix: context.prefix
    });

    if (result.isNew) {
      const previewOnAdd = await getPreviewOnAddForGuild(message.guild.id);
      const candidate = await prepareTitleWatchBaseline(
        message.guild.id,
        result.watch.keyword,
        result.watch.maxAgeDays
      );
      const preview = previewOnAdd
        ? await (async () => {
            const setupPreview = await sendTitleWatchSetupPreview(
              discordChannel,
              result.watch,
              candidate?.trackedChannel || null,
              candidate?.latestVideo || null
            );

            return setupPreview;
          })()
        : {
            sent: false,
            reason: [
              "**Status:** Preview otomatis nonaktif",
              "Server ini mematikan setup preview saat addtitlewatch."
            ].join("\n")
          };

      embed.addFields({
        name: "Status Setup Preview",
        value: preview.reason,
        inline: false
      });
    }

    await message.reply({ embeds: [embed] });
  }
};
