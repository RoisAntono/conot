const { PermissionFlagsBits } = require("discord.js");

const REQUIRED_SEND_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks
];

const PERMISSION_LABELS = new Map([
  [PermissionFlagsBits.ViewChannel, "View Channel"],
  [PermissionFlagsBits.SendMessages, "Send Messages"],
  [PermissionFlagsBits.EmbedLinks, "Embed Links"],
  [PermissionFlagsBits.MentionEveryone, "Mention Everyone"]
]);

function getPermissionLabel(permission) {
  return PERMISSION_LABELS.get(permission) || String(permission);
}

function getMissingSendPermissions(channel, clientUser) {
  const permissions = channel?.permissionsFor?.(clientUser);
  if (!permissions) {
    return [];
  }

  return REQUIRED_SEND_PERMISSIONS.filter((permission) => !permissions.has(permission));
}

function getRolePingDetails(channel, roleId, clientUser) {
  if (!channel?.guild || !roleId) {
    return [];
  }

  const role = channel.guild.roles.cache.get(roleId) || null;
  if (!role) {
    return [
      {
        name: "Role Ping",
        value: "Role yang tersimpan sudah tidak ada. Update tracker/title watch jika ping role memang masih diperlukan.",
        inline: false
      }
    ];
  }

  const permissions = channel.permissionsFor(clientUser);
  if (role.mentionable || permissions?.has(PermissionFlagsBits.MentionEveryone)) {
    return [];
  }

  return [
    {
      name: "Role Ping",
      value: "Role tidak mentionable dan bot tidak punya permission `Mention Everyone`. Notifikasi tetap bisa terkirim, tetapi role mungkin tidak ter-ping.",
      inline: false
    }
  ];
}

function diagnoseChannelAccess(channel, clientUser) {
  if (!channel) {
    return {
      ok: false,
      missingPermissions: [],
      cause: "Channel Discord target tidak ditemukan atau bot sudah kehilangan akses ke channel tersebut.",
      solution: "Pastikan channel belum dihapus dan bot masih memiliki akses ke channel target. Jika perlu, jalankan command update/set ulang channel tujuan.",
      details: []
    };
  }

  const missingPermissions = getMissingSendPermissions(channel, clientUser);
  if (missingPermissions.length) {
    return {
      ok: false,
      missingPermissions,
      cause: `Bot tidak memiliki permission yang dibutuhkan di channel target: ${missingPermissions.map(getPermissionLabel).join(", ")}.`,
      solution: "Buka pengaturan permission channel target lalu izinkan bot untuk `View Channel`, `Send Messages`, dan `Embed Links`.",
      details: [
        {
          name: "Permission Hilang",
          value: missingPermissions.map(getPermissionLabel).join(", "),
          inline: false
        }
      ]
    };
  }

  return {
    ok: true,
    missingPermissions: [],
    cause: "Channel target terlihat valid, tetapi bot tetap gagal mengakses atau mengirim pesan.",
    solution: "Cek override permission channel, kategori parent, dan apakah bot masih berada di server dengan role yang benar.",
    details: []
  };
}

function diagnoseDiscordSendError({ channel, clientUser, error, roleId = null }) {
  const details = [
    ...getRolePingDetails(channel, roleId, clientUser)
  ];
  const channelDiagnosis = diagnoseChannelAccess(channel, clientUser);

  if (channelDiagnosis.details.length) {
    details.push(...channelDiagnosis.details);
  }

  const code = Number(error?.code);

  if (code === 50013) {
    return {
      cause: channelDiagnosis.cause,
      solution: channelDiagnosis.solution,
      details
    };
  }

  if (code === 50001) {
    return {
      cause: "Discord menolak akses bot ke channel target (`Missing Access`). Biasanya channel tersembunyi oleh permission override atau bot kehilangan akses kategori.",
      solution: "Pastikan bot bisa melihat channel target dan kategori parent-nya. Jika channel dipindah atau permission override berubah, set ulang target channel.",
      details
    };
  }

  if (code === 10003) {
    return {
      cause: "Discord mengembalikan `Unknown Channel`. Channel target kemungkinan sudah dihapus atau ID channel tersimpan sudah tidak valid.",
      solution: "Update tracker/title watch ke channel yang masih ada atau set ulang log channel bila channel lama sudah dihapus.",
      details
    };
  }

  if (code === 50035) {
    return {
      cause: "Payload pesan ditolak Discord (`Invalid Form Body`). Biasanya ada field embed atau konten yang terlalu panjang atau formatnya tidak valid.",
      solution: "Periksa custom message, judul video, dan panjang field embed. Jika memakai template custom, coba sederhanakan pesannya.",
      details
    };
  }

  return {
    cause: channelDiagnosis.cause,
    solution: "Periksa permission bot di channel target, lihat detail error pada log, lalu coba kirim notifikasi lagi setelah permission atau target channel diperbaiki.",
    details
  };
}

module.exports = {
  diagnoseChannelAccess,
  diagnoseDiscordSendError
};
