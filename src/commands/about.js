const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { DEFAULT_PREFIX, getPrefixForGuild } = require("../services/prefixService");

function buildAboutEmbed(prefix) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("About - Discord Bot Notifikasi YouTube")
    .setDescription(
      "Bot Discord modular berbasis Node.js dan discord.js v14 untuk notifikasi YouTube gratis tanpa YouTube Data API."
    )
    .addFields(
      {
        name: "Tujuan Utama",
        value: [
          "- Gratis",
          "- Ringan",
          "- Modular",
          "- Cocok untuk server komunitas",
          "- Aman dari notifikasi ganda",
          "- Tidak bergantung pada YouTube Data API"
        ].join("\n")
      },
      {
        name: "Cara Kerja Inti",
        value: [
          "- Tracker channel memakai RSS feed resmi YouTube",
          "- Title watch memakai pencarian YouTube berbasis scraping ringan",
          "- Polling berjalan tiap 5 menit",
          "- State video disimpan di `data.json`",
          "- Guard dedupe menahan spam dan retry berulang"
        ].join("\n")
      },
      {
        name: "Fitur Inti",
        value: [
          "- Tracker channel + ping role",
          "- Filter konten, filter judul, title watch",
          "- Custom message dan layout embed",
          "- Setup preview saat add",
          "- Log channel dengan penyebab dan solusi error",
          "- Slash command dan prefix command"
        ].join("\n")
      },
      {
        name: "Batasan Sistem",
        value: [
          "- Tidak memakai YouTube Data API v3",
          "- Sumber utama channel tracker tetap RSS YouTube",
          "- Title watch bergantung pada hasil pencarian YouTube saat itu",
          "- Karena berbasis scraping, edge case YouTube tetap mungkin terjadi"
        ].join("\n")
      }
    )
    .setFooter({ text: `Gunakan ${prefix} help untuk setup command dan ${prefix} setlogchannel #bot-logs untuk log.` })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("about")
    .setDescription("Tampilkan ringkasan tujuan, fitur inti, dan batasan bot."),
  prefix: {
    name: "about",
    aliases: ["info", "botinfo"],
    usage: "about"
  },
  async execute(interaction) {
    const prefix = await getPrefixForGuild(interaction.guildId);
    await interaction.reply({
      embeds: [buildAboutEmbed(prefix || DEFAULT_PREFIX)],
      ephemeral: true
    });
  },
  async executePrefix(message) {
    const prefix = await getPrefixForGuild(message.guild.id);
    await message.reply({
      embeds: [buildAboutEmbed(prefix || DEFAULT_PREFIX)]
    });
  }
};
