const {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const {
  OWNER_COMMAND_RATE_LIMIT_MS,
  SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS
} = require("../config/constants");
const { getDevLogSettings, updateDevLogSettings } = require("../services/logChannelService");
const { resolveGuildChannel } = require("../utils/discordResolvers");
const {
  buildDevLogChannelUpdatedEmbed,
  buildValidationErrorEmbed
} = require("../utils/embedFactory");

function isDisableValue(value) {
  return ["off", "disable", "disabled", "none", "clear", "reset"].includes(String(value || "").trim().toLowerCase());
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setdevlogchannel")
    .setDescription("Atur channel dev-log detail global (owner-only).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("discord_channel")
        .setDescription("Channel tujuan dev log")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("disable")
        .setDescription("Nonaktifkan dev log channel")
        .setRequired(false)
    ),
  prefix: {
    name: "setdevlogchannel",
    aliases: ["devlogchannel", "setdevlog"],
    usage: "setdevlogchannel <#channel|off>"
  },
  ownerOnly: true,
  rateLimitMs: OWNER_COMMAND_RATE_LIMIT_MS,
  rateLimitBucket: "owner_guard",
  rateLimitBucketMs: SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const disable = interaction.options.getBoolean("disable") || false;
    const discordChannel = interaction.options.getChannel("discord_channel");

    if (!disable && !discordChannel) {
      const current = await getDevLogSettings();
      await interaction.editReply({
        embeds: [buildValidationErrorEmbed(
          `Pilih channel atau gunakan disable:true. Dev log saat ini: ${
            current.devLogChannelId ? `<#${current.devLogChannelId}>` : "nonaktif"
          }.`
        )]
      });
      return;
    }

    const updated = await updateDevLogSettings({
      devLogChannelId: disable ? null : discordChannel.id
    });
    await interaction.editReply({
      embeds: [buildDevLogChannelUpdatedEmbed(updated.devLogChannelId)]
    });
  },
  async executePrefix(message, args, context) {
    const rawValue = args[0];

    if (!rawValue) {
      const current = await getDevLogSettings();
      await message.reply({
        embeds: [buildValidationErrorEmbed(
          `Format: \`${context.prefix} ${this.prefix.usage}\`. Dev log saat ini: ${
            current.devLogChannelId ? `<#${current.devLogChannelId}>` : "nonaktif"
          }.`
        )]
      });
      return;
    }

    if (isDisableValue(rawValue)) {
      const updated = await updateDevLogSettings({ devLogChannelId: null });
      await message.reply({
        embeds: [buildDevLogChannelUpdatedEmbed(updated.devLogChannelId)]
      });
      return;
    }

    const discordChannel = await resolveGuildChannel(message.guild, rawValue);
    if (!discordChannel) {
      await message.reply({
        embeds: [buildValidationErrorEmbed("Channel dev log tidak valid.")]
      });
      return;
    }

    const updated = await updateDevLogSettings({ devLogChannelId: discordChannel.id });
    await message.reply({
      embeds: [buildDevLogChannelUpdatedEmbed(updated.devLogChannelId)]
    });
  }
};
