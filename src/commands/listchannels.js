const {
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { getPrefixForGuild } = require("../services/prefixService");
const { buildTrackedChannelsEmbed, listTrackedChannels } = require("../services/trackerService");
const { buildEmptyListEmbed } = require("../utils/embedFactory");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("listchannels")
    .setDescription("Lihat daftar channel YouTube yang sedang dipantau.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  prefix: {
    name: "listchannels",
    aliases: ["channels", "listyt"],
    usage: "listchannels"
  },
  requiredPermissions: PermissionFlagsBits.ManageGuild,
  async execute(interaction) {
    const trackedChannels = await listTrackedChannels(interaction.guildId);
    const guildPrefix = await getPrefixForGuild(interaction.guildId);

    if (!trackedChannels.length) {
      await interaction.reply({
        embeds: [buildEmptyListEmbed(guildPrefix)],
        ephemeral: true
      });
      return;
    }

    const embed = buildTrackedChannelsEmbed(trackedChannels, guildPrefix);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
  async executePrefix(message, args, context) {
    const trackedChannels = await listTrackedChannels(message.guild.id);

    if (!trackedChannels.length) {
      await message.reply({ embeds: [buildEmptyListEmbed(context.prefix)] });
      return;
    }

    const embed = buildTrackedChannelsEmbed(trackedChannels, context.prefix);
    await message.reply({ embeds: [embed] });
  }
};
