const {
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { getPrefixForGuild } = require("../services/prefixService");
const { listTitleWatches } = require("../services/titleWatchService");
const {
  buildEmptyTitleWatchListEmbed,
  buildTitleWatchListEmbed
} = require("../utils/embedFactory");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("listtitlewatches")
    .setDescription("Lihat daftar keyword title watch global di server ini.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  prefix: {
    name: "listtitlewatches",
    aliases: ["titlewatches", "listwatchtitles"],
    usage: "listtitlewatches"
  },
  requiredPermissions: PermissionFlagsBits.ManageGuild,
  async execute(interaction) {
    const prefix = await getPrefixForGuild(interaction.guildId);
    const titleWatches = await listTitleWatches(interaction.guildId);

    if (!titleWatches.length) {
      await interaction.reply({
        embeds: [buildEmptyTitleWatchListEmbed(prefix)],
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      embeds: [buildTitleWatchListEmbed(titleWatches, prefix)],
      ephemeral: true
    });
  },
  async executePrefix(message, args, context) {
    const titleWatches = await listTitleWatches(message.guild.id);

    if (!titleWatches.length) {
      await message.reply({ embeds: [buildEmptyTitleWatchListEmbed(context.prefix)] });
      return;
    }

    await message.reply({
      embeds: [buildTitleWatchListEmbed(titleWatches, context.prefix)]
    });
  }
};
