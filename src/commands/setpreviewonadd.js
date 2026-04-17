const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const {
  SETTINGS_COMMAND_RATE_LIMIT_MS,
  SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS
} = require("../config/constants");
const { getPreviewOnAddForGuild, updatePreviewOnAddForGuild } = require("../services/previewService");
const {
  buildPreviewOnAddUpdatedEmbed,
  buildValidationErrorEmbed
} = require("../utils/embedFactory");

function parseEnabled(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["on", "true", "enable", "enabled", "1"].includes(normalized)) {
    return true;
  }

  if (["off", "false", "disable", "disabled", "0"].includes(normalized)) {
    return false;
  }

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setpreviewonadd")
    .setDescription("Aktifkan atau nonaktifkan setup preview saat addchannel/addtitlewatch.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((option) =>
      option
        .setName("enabled")
        .setDescription("Status preview otomatis saat penambahan tracker")
        .setRequired(true)
    ),
  prefix: {
    name: "setpreviewonadd",
    aliases: ["previewonadd", "setpreview"],
    usage: "setpreviewonadd <on|off>"
  },
  requiredPermissions: PermissionFlagsBits.ManageGuild,
  rateLimitMs: SETTINGS_COMMAND_RATE_LIMIT_MS,
  rateLimitBucket: "sensitive_setup",
  rateLimitBucketMs: SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const enabled = interaction.options.getBoolean("enabled", true);
    const current = await getPreviewOnAddForGuild(interaction.guildId);
    const updated = await updatePreviewOnAddForGuild(interaction.guildId, enabled);

    await interaction.editReply({
      embeds: [buildPreviewOnAddUpdatedEmbed(updated.previewOnAdd ?? current)]
    });
  },
  async executePrefix(message, args, context) {
    const enabled = parseEnabled(args[0]);

    if (enabled === null) {
      await message.reply({
        embeds: [buildValidationErrorEmbed(`Format: \`${context.prefix} ${this.prefix.usage}\``)]
      });
      return;
    }

    const updated = await updatePreviewOnAddForGuild(message.guild.id, enabled);
    await message.reply({
      embeds: [buildPreviewOnAddUpdatedEmbed(updated.previewOnAdd)]
    });
  }
};
