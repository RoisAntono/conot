const {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const {
  SETTINGS_COMMAND_RATE_LIMIT_MS,
  SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS
} = require("../config/constants");
const { updateLogChannelForGuild } = require("../services/logChannelService");
const { logGuildAction } = require("../services/userActionLogService");
const { resolveGuildChannel } = require("../utils/discordResolvers");
const {
  buildLogChannelUpdatedEmbed,
  buildValidationErrorEmbed
} = require("../utils/embedFactory");

function isDisableValue(value) {
  return ["off", "disable", "disabled", "none", "clear", "reset"].includes(String(value || "").trim().toLowerCase());
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setlogchannel")
    .setDescription("Atur channel Discord untuk log aksi admin (audit konfigurasi).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("discord_channel")
        .setDescription("Channel tujuan log aksi admin")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("disable")
        .setDescription("Nonaktifkan log channel untuk server ini")
        .setRequired(false)
    ),
  prefix: {
    name: "setlogchannel",
    aliases: ["logchannel", "botlogchannel"],
    usage: "setlogchannel <#channel|off>"
  },
  requiredPermissions: PermissionFlagsBits.ManageGuild,
  rateLimitMs: SETTINGS_COMMAND_RATE_LIMIT_MS,
  rateLimitBucket: "sensitive_setup",
  rateLimitBucketMs: SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const disable = interaction.options.getBoolean("disable") || false;
    const discordChannel = interaction.options.getChannel("discord_channel");

    if (!disable && !discordChannel) {
      await interaction.editReply({
        embeds: [buildValidationErrorEmbed("Pilih channel log atau aktifkan opsi `disable:true`.")]
      });
      return;
    }

    const updated = await updateLogChannelForGuild(interaction.guildId, disable ? null : discordChannel.id);
    await interaction.editReply({
      embeds: [buildLogChannelUpdatedEmbed(updated.logChannelId, interaction.guildId)]
    });

    await logGuildAction(interaction.client, {
      guildId: interaction.guildId,
      actor: interaction.user,
      action: "Log channel diperbarui",
      description: disable
        ? "Admin menonaktifkan channel log aksi server."
        : "Admin mengubah channel log aksi server.",
      keyParts: [updated.logChannelId || "off", interaction.user?.id],
      details: [
        {
          name: "Log Channel",
          value: updated.logChannelId ? `<#${updated.logChannelId}>` : "Nonaktif",
          inline: true
        }
      ]
    });
  },
  async executePrefix(message, args, context) {
    const rawValue = args[0];

    if (!rawValue) {
      await message.reply({
        embeds: [buildValidationErrorEmbed(`Format: \`${context.prefix} ${this.prefix.usage}\``)]
      });
      return;
    }

    if (isDisableValue(rawValue)) {
      const updated = await updateLogChannelForGuild(message.guild.id, null);
      await message.reply({
        embeds: [buildLogChannelUpdatedEmbed(updated.logChannelId, message.guild.id)]
      });

      await logGuildAction(message.client, {
        guildId: message.guild.id,
        actor: message.author,
        action: "Log channel diperbarui",
        description: "Admin menonaktifkan channel log aksi server.",
        keyParts: ["off", message.author?.id],
        details: [
          {
            name: "Log Channel",
            value: "Nonaktif",
            inline: true
          }
        ]
      });
      return;
    }

    const discordChannel = await resolveGuildChannel(message.guild, rawValue);
    if (!discordChannel) {
      await message.reply({
        embeds: [buildValidationErrorEmbed("Channel log tidak valid.")]
      });
      return;
    }

    const updated = await updateLogChannelForGuild(message.guild.id, discordChannel.id);
    await message.reply({
      embeds: [buildLogChannelUpdatedEmbed(updated.logChannelId, message.guild.id)]
    });

    await logGuildAction(message.client, {
      guildId: message.guild.id,
      actor: message.author,
      action: "Log channel diperbarui",
      description: "Admin mengubah channel log aksi server.",
      keyParts: [updated.logChannelId, message.author?.id],
      details: [
        {
          name: "Log Channel",
          value: `<#${updated.logChannelId}>`,
          inline: true
        }
      ]
    });
  }
};
