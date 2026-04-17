const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { isOwnerUser } = require("../services/accessGuardService");
const { DEFAULT_PREFIX, getPrefixForGuild } = require("../services/prefixService");

function renderCommandLines(items) {
  return items
    .map((item) => {
      return `\`${item.name}\`\n${item.description}`;
    })
    .join("\n\n");
}

function createCommandGroups({ prefixMode = false, prefixValue = DEFAULT_PREFIX } = {}) {
  const slashCommand = (name) => `/${name}`;
  const prefixCommand = (example) => `${prefixValue} ${example}`;
  const commandName = (name, prefixExample = name) => {
    return prefixMode ? prefixCommand(prefixExample) : slashCommand(name);
  };

  return {
    summary: {
      name: commandName("setlogchannel", "setlogchannel #bot-logs"),
      description: "Atur channel log lebih dulu agar error operasional bisa dipantau dengan jelas."
    },
    tracker: [
      { name: commandName("addchannel", "addchannel @windahbasudara #youtube-updates"), description: "Tambahkan channel YouTube ke daftar tracker server." },
      { name: commandName("updatechannel", "updatechannel @usernameid #youtube-updates @Subscriber live_now"), description: "Perbarui target Discord, filter konten, atau pengaturan tracker yang sudah ada." },
      { name: commandName("removechannel", "removechannel @usernameid"), description: "Hapus tracker channel YouTube dari server ini." },
      { name: commandName("listchannels", "listchannels"), description: "Tampilkan semua tracker channel yang aktif di server ini." },
      { name: commandName("setlayout", "setlayout @usernameid compact"), description: "Ubah layout embed notifikasi channel menjadi compact atau rich." }
    ],
    titleWatch: [
      { name: commandName("addtitlewatch", "addtitlewatch \"judul\" #alert-judul --days 3"), description: "Pantau keyword judul lintas hasil pencarian YouTube dan kirim notifikasi saat cocok." },
      { name: commandName("removetitlewatch", "removetitlewatch \"judul\""), description: "Hapus keyword title watch dari server ini." },
      { name: commandName("listtitlewatches", "listtitlewatches"), description: "Lihat semua keyword title watch yang aktif." }
    ],
    settings: [
      { name: commandName("help", "help"), description: "Tampilkan panduan command yang tersedia." },
      { name: commandName("about", "about"), description: "Lihat gambaran singkat tujuan dan batasan sistem bot." },
      { name: commandName("health", "health"), description: "Cek status runtime bot, poller, dan storage." },
      { name: commandName("setlogchannel", "setlogchannel #bot-logs"), description: "Atur channel untuk log operasional server." },
      { name: commandName("setpreviewonadd", "setpreviewonadd on"), description: "Aktifkan atau matikan setup preview saat menambah tracker atau title watch." },
      { name: commandName("setprefix", "setprefix !"), description: "Ubah prefix command untuk mode pesan biasa." }
    ],
    owner: [
      { name: commandName("setguard", "setguard guild on user on leave off"), description: "Atur mode whitelist guild dan user untuk instance bot." },
      { name: commandName("setdevlogchannel", "setdevlogchannel #dev-log"), description: "Atur channel dev log global untuk diagnosa owner." },
      { name: commandName("whitelistguild", "whitelistguild add 123456789012345678"), description: "Kelola daftar guild yang diizinkan memakai bot." },
      { name: commandName("whitelistuser", "whitelistuser add 987654321098765432"), description: "Kelola daftar user yang diizinkan menjalankan command." }
    ]
  };
}

function buildHelpEmbed({ isDevView = false, prefixMode = false, prefixValue = DEFAULT_PREFIX } = {}) {
  const groups = createCommandGroups({ prefixMode, prefixValue });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Help Commands")
    .setDescription(
      prefixMode
        ? "Mode bantuan ini menampilkan command prefix untuk user yang memakai command berbasis pesan."
        : "Mode bantuan ini menampilkan slash command sebagai standar penggunaan."
    )
    .addFields(
      {
        name: "Ringkasan",
        value: [
          `\`${groups.summary.name}\``,
          groups.summary.description
        ].join("\n")
      },
      {
        name: "Tracker Channel",
        value: renderCommandLines(groups.tracker)
      },
      {
        name: "Title Watch",
        value: renderCommandLines(groups.titleWatch)
      },
      {
        name: "Pengaturan Bot",
        value: renderCommandLines(groups.settings)
      },
      {
        name: "Catatan",
        value: [
          "Permission `Manage Server` dibutuhkan untuk command administrasi.",
          prefixMode
            ? "Pastikan ada spasi setelah prefix agar command dapat diparse dengan benar."
            : "Prefix command tetap tersedia untuk server yang lebih nyaman memakai mode pesan."
        ].join("\n")
      }
    )
    .setTimestamp();

  if (isDevView) {
    embed.addFields({
      name: "Guard Owner-Only",
      value: renderCommandLines(groups.owner)
    });
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Tampilkan panduan penggunaan dan fitur bot."),
  prefix: {
    name: "help",
    aliases: ["commands", "cmd"],
    usage: "help"
  },
  async execute(interaction) {
    const embed = buildHelpEmbed({
      isDevView: isOwnerUser(interaction.user?.id),
      prefixMode: false
    });

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  },
  async executePrefix(message) {
    const prefix = await getPrefixForGuild(message.guild?.id);
    const embed = buildHelpEmbed({
      isDevView: isOwnerUser(message.author?.id),
      prefixMode: true,
      prefixValue: prefix || DEFAULT_PREFIX
    });

    await message.reply({ embeds: [embed] });
  }
};
