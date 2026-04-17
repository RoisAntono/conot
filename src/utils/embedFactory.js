const { EmbedBuilder } = require("discord.js");
const {
  DEFAULT_CUSTOM_MESSAGE,
  DEFAULT_TITLE_WATCH_MAX_AGE_DAYS
} = require("../config/constants");
const { getContentFilterLabel } = require("./contentFilter");
const { getEmbedLayoutLabel } = require("./embedLayout");
const { getTitleFilterLabel } = require("./titleFilter");

const EMBED_COLORS = {
  brand: 0x5865f2,
  success: 0x22c55e,
  info: 0x2563eb,
  warning: 0xf59e0b,
  error: 0xef4444,
  live: 0xef4444,
  upcoming: 0x2563eb,
  replay: 0x8b5cf6,
  shorts: 0xf59e0b
};

const LIVE_STATES = new Set(["live", "members_live"]);
const UPCOMING_STATES = new Set([
  "upcoming",
  "members_upcoming",
  "premiere_upcoming",
  "members_premiere_upcoming"
]);
const REPLAY_STATES = new Set(["replay_stream", "members_replay_stream"]);
const PREMIERE_STATES = new Set(["premiere_video", "members_premiere_video"]);

function truncateText(value, maxLength = 180) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

function resolveToneColor(tone, color) {
  if (Number.isFinite(color)) {
    return color;
  }

  if (tone && Object.prototype.hasOwnProperty.call(EMBED_COLORS, tone)) {
    return EMBED_COLORS[tone];
  }

  return EMBED_COLORS.brand;
}

function resolveNotificationBadge(latestVideo) {
  const state = latestVideo?.contentState || null;

  if (latestVideo?.isShort || state === "shorts") {
    return "SHORTS";
  }

  if (LIVE_STATES.has(state)) {
    return "LIVE";
  }

  if (UPCOMING_STATES.has(state)) {
    return "UPCOMING";
  }

  if (REPLAY_STATES.has(state)) {
    return "REPLAY";
  }

  if (PREMIERE_STATES.has(state)) {
    return "PREMIERE";
  }

  return "VIDEO";
}

function resolveNotificationTone(latestVideo) {
  const state = latestVideo?.contentState || null;

  if (latestVideo?.isShort || state === "shorts") {
    return "shorts";
  }

  if (LIVE_STATES.has(state)) {
    return "live";
  }

  if (UPCOMING_STATES.has(state)) {
    return "upcoming";
  }

  if (REPLAY_STATES.has(state) || PREMIERE_STATES.has(state)) {
    return "replay";
  }

  return "brand";
}

function getVideoChannelName(trackedChannel, latestVideo) {
  return trackedChannel.youtube.title || trackedChannel.youtube.username || latestVideo.channelTitle || "channel ini";
}

function buildEmbedVideoTitle(latestVideo) {
  return `[${resolveNotificationBadge(latestVideo)}] ${truncateText(latestVideo.title, 220)}`;
}

function buildVideoLinkFieldValue(link) {
  return `[Buka di YouTube](${link})`;
}

function formatDiscordTimestamp(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const unixSeconds = Math.floor(date.getTime() / 1000);
  return `<t:${unixSeconds}:F> (<t:${unixSeconds}:R>)`;
}

function buildStreamWindowValue(startedAt, endedAt) {
  const parts = [];

  if (startedAt) {
    parts.push(`Mulai: ${formatDiscordTimestamp(startedAt)}`);
  }

  if (endedAt) {
    parts.push(`Selesai: ${formatDiscordTimestamp(endedAt)}`);
  }

  return parts.join("\n");
}

function buildVideoTimingFields(latestVideo) {
  const fields = [];
  const state = latestVideo.contentState;

  if ([
    "upcoming",
    "members_upcoming",
    "premiere_upcoming",
    "members_premiere_upcoming"
  ].includes(state) && latestVideo.scheduledStartAt) {
    fields.push({
      name: "Dimulai",
      value: formatDiscordTimestamp(latestVideo.scheduledStartAt),
      inline: false
    });

    return fields;
  }

  if (["live", "members_live"].includes(state) && latestVideo.startedAt) {
    fields.push({
      name: "Live Sejak",
      value: formatDiscordTimestamp(latestVideo.startedAt),
      inline: false
    });

    return fields;
  }

  if (["replay_stream", "members_replay_stream"].includes(state)) {
    if (latestVideo.publishedAt) {
      fields.push({
        name: "Dipublikasikan",
        value: formatDiscordTimestamp(latestVideo.publishedAt),
        inline: false
      });
    }

    if (latestVideo.startedAt || latestVideo.endedAt) {
      fields.push({
        name: "Waktu Stream",
        value: buildStreamWindowValue(latestVideo.startedAt, latestVideo.endedAt),
        inline: false
      });
    }

    return fields;
  }

  if (latestVideo.publishedAt) {
    fields.push({
      name: "Dipublikasikan",
      value: formatDiscordTimestamp(latestVideo.publishedAt),
      inline: false
    });
  }

  if (latestVideo.startedAt && latestVideo.endedAt && !fields.length) {
    fields.push({
      name: "Waktu Stream",
      value: buildStreamWindowValue(latestVideo.startedAt, latestVideo.endedAt),
      inline: false
    });
  }

  return fields;
}

function buildStatusEmbed({ title, description, tone = "brand", color = null, fields = [], thumbnailUrl = null, footerText = null }) {
  const embed = new EmbedBuilder()
    .setColor(resolveToneColor(tone, color))
    .setTitle(title)
    .setTimestamp();

  if (description) {
    embed.setDescription(description);
  }

  if (fields.length) {
    embed.addFields(fields);
  }

  if (thumbnailUrl) {
    embed.setThumbnail(thumbnailUrl);
  }

  if (footerText) {
    embed.setFooter({ text: footerText });
  }

  return embed;
}

function applyNotificationMediaLayout(embed, latestVideo, trackedChannel) {
  const layout = trackedChannel.notifications?.embedLayout || "compact";
  const imageUrl = latestVideo.thumbnailUrl || null;

  if (!imageUrl) {
    return embed;
  }

  if (layout === "rich") {
    return embed.setImage(imageUrl);
  }

  return embed.setThumbnail(imageUrl);
}

function buildTrackerResultEmbed({ actionLabel, trackedEntry, latestVideo, prefix }) {
  return buildStatusEmbed({
    tone: "success",
    title: `Tracker berhasil ${actionLabel}`,
    description: `Channel **${trackedEntry.youtube.title || trackedEntry.youtube.username}** sekarang dipantau oleh bot.`,
    thumbnailUrl: latestVideo?.thumbnailUrl || null,
    footerText: `Prefix saat ini: ${prefix}`,
    fields: [
      {
        name: "YouTube",
        value: [
          `Handle: \`${trackedEntry.youtube.username}\``,
          `Channel ID: \`${trackedEntry.youtube.channelId}\``
        ].join("\n"),
        inline: true
      },
      {
        name: "Discord Target",
        value: [
          `Channel: <#${trackedEntry.discord.channelId}>`,
          `Ping Role: ${trackedEntry.discord.roleId ? `<@&${trackedEntry.discord.roleId}>` : "Tidak ada"}`
        ].join("\n"),
        inline: true
      },
      {
        name: "Pengaturan",
        value: [
          `Filter: ${getContentFilterLabel(trackedEntry.notifications?.contentFilter)}`,
          `Layout: ${getEmbedLayoutLabel(trackedEntry.notifications?.embedLayout)}`,
          `Filter Judul: ${getTitleFilterLabel(trackedEntry.notifications?.titleFilters ?? trackedEntry.notifications?.titleFilter)}`,
          `Custom Message: ${trackedEntry.notifications?.customMessage ? "Aktif" : "Default"}`
        ].join("\n"),
        inline: false
      },
      {
        name: "Video Terakhir",
        value: latestVideo
          ? `[${latestVideo.title}](${latestVideo.link})`
          : "Baseline RSS belum tersedia. Polling berikutnya akan mencoba lagi.",
        inline: false
      }
    ]
  });
}

function buildTrackerRemovedEmbed(removedEntry, prefix) {
  return buildStatusEmbed({
    tone: "info",
    title: "Tracker dihapus",
    description: `Tracker untuk **${removedEntry.youtube.title || removedEntry.youtube.username}** berhasil dihapus dari server ini.`,
    footerText: `Prefix saat ini: ${prefix}`,
    fields: [
      {
        name: "Data Terakhir",
        value: [
          `YouTube ID: \`${removedEntry.youtube.channelId}\``,
          `Target Discord: <#${removedEntry.discord.channelId}>`
        ].join("\n")
      }
    ]
  });
}

function buildTrackerNotFoundEmbed(prefix) {
  return buildStatusEmbed({
    tone: "warning",
    title: "Tracker tidak ditemukan",
    description: "Bot tidak menemukan tracker YouTube yang cocok di server ini.",
    footerText: `Gunakan ${prefix} listchannels untuk mengecek daftar tracker aktif.`
  });
}

function buildPrefixUpdatedEmbed({ oldPrefix, newPrefix }) {
  return buildStatusEmbed({
    tone: "success",
    title: "Prefix diperbarui",
    description: `Prefix berhasil diubah dari \`${oldPrefix}\` menjadi \`${newPrefix}\`.`
  });
}

function buildPreviewOnAddUpdatedEmbed(enabled) {
  return buildStatusEmbed({
    tone: "success",
    title: "Preview On Add diperbarui",
    description: enabled
      ? "Setup preview saat menambahkan tracker atau title watch sekarang **aktif**."
      : "Setup preview saat menambahkan tracker atau title watch sekarang **nonaktif**."
  });
}

function buildLogChannelUpdatedEmbed(logChannelId) {
  return buildStatusEmbed({
    tone: "success",
    title: "Log Channel diperbarui",
    description: logChannelId
      ? `Log bot sekarang akan dikirim ke <#${logChannelId}>.`
      : "Log bot untuk server ini sekarang **dinonaktifkan**."
  });
}

function buildDevLogChannelUpdatedEmbed(logChannelId) {
  return buildStatusEmbed({
    tone: "success",
    title: "Dev Log Channel diperbarui",
    description: logChannelId
      ? `Dev log detail sekarang dikirim ke <#${logChannelId}> (owner-only setup).`
      : "Dev log detail global sekarang **dinonaktifkan**."
  });
}

function buildValidationErrorEmbed(message) {
  return buildStatusEmbed({
    title: "Input tidak valid",
    description: message,
    tone: "warning"
  });
}

function buildCommandErrorEmbed(commandName) {
  return buildStatusEmbed({
    title: "Command gagal dijalankan",
    description: `Terjadi error saat menjalankan \`${commandName}\`. Cek log bot untuk detailnya.`,
    tone: "error"
  });
}

function buildRateLimitEmbed(commandName, retryAfterMs) {
  const retryAfterSeconds = Math.max(1, Math.ceil((Number(retryAfterMs) || 0) / 1000));

  return buildStatusEmbed({
    title: "Command terlalu cepat diulang",
    description: `Tunggu sekitar **${retryAfterSeconds} detik** sebelum menjalankan \`${commandName}\` lagi.`,
    tone: "warning"
  });
}

function buildAccessDeniedEmbed(reason) {
  const description = reason === "guild_not_whitelisted"
    ? "Server ini belum masuk whitelist guild untuk instance bot ini. Minta owner bot menambahkan guild ini ke whitelist atau nonaktifkan guard guild."
    : "User kamu belum masuk whitelist user untuk instance bot ini. Minta owner bot menambahkan user kamu ke whitelist atau nonaktifkan guard user.";

  return buildStatusEmbed({
    title: "Akses ditolak",
    description,
    tone: "warning"
  });
}

function formatWhitelistEntries(entries, formatter) {
  if (!entries.length) {
    return "`Kosong`";
  }

  const limitedEntries = entries.slice(0, 20);
  const lines = limitedEntries.map((entry, index) => `${index + 1}. ${formatter(entry)}`);

  if (entries.length > limitedEntries.length) {
    lines.push(`... dan ${entries.length - limitedEntries.length} item lainnya`);
  }

  return lines.join("\n");
}

function buildAccessGuardStatusEmbed(accessControl, ownerUserIds = []) {
  return buildStatusEmbed({
    title: "Status Access Guard",
    description: "Guard instance mengatur apakah bot boleh aktif di guild tertentu dan siapa saja yang boleh menjalankan command.",
    fields: [
      {
        name: "Mode",
        value: [
          `Guild Whitelist: ${accessControl.guildWhitelistEnabled ? "Aktif" : "Nonaktif"}`,
          `User Whitelist: ${accessControl.userWhitelistEnabled ? "Aktif" : "Nonaktif"}`,
          `Auto Leave Guild Tidak Diizinkan: ${accessControl.leaveUnauthorizedGuilds ? "Aktif" : "Nonaktif"}`
        ].join("\n"),
        inline: false
      },
      {
        name: `Whitelist Guild (${accessControl.whitelistGuildIds.length})`,
        value: formatWhitelistEntries(accessControl.whitelistGuildIds, (guildId) => `\`${guildId}\``),
        inline: false
      },
      {
        name: `Whitelist User (${accessControl.whitelistUserIds.length})`,
        value: formatWhitelistEntries(accessControl.whitelistUserIds, (userId) => `<@${userId}> \`${userId}\``),
        inline: false
      },
      {
        name: `Owner Env (${ownerUserIds.length})`,
        value: formatWhitelistEntries(ownerUserIds, (userId) => `<@${userId}> \`${userId}\``),
        inline: false
      }
    ]
  });
}

function buildWhitelistUpdatedEmbed({ type, action, targetId, accessControl }) {
  const targetLabel = type === "guild" ? "Guild" : "User";
  const targetValue = type === "guild" ? `\`${targetId}\`` : `<@${targetId}> (\`${targetId}\`)`;

  return buildStatusEmbed({
    title: `${targetLabel} whitelist diperbarui`,
    description: `${targetLabel} ${targetValue} berhasil ${action === "add" ? "ditambahkan ke" : "dihapus dari"} whitelist.`,
    fields: [
      {
        name: "Ringkasan Guard",
        value: [
          `Guild Whitelist: ${accessControl.guildWhitelistEnabled ? "Aktif" : "Nonaktif"}`,
          `User Whitelist: ${accessControl.userWhitelistEnabled ? "Aktif" : "Nonaktif"}`,
          `Auto Leave: ${accessControl.leaveUnauthorizedGuilds ? "Aktif" : "Nonaktif"}`
        ].join("\n"),
        inline: false
      }
    ]
  });
}

function buildEmptyListEmbed(prefix) {
  return buildStatusEmbed({
    tone: "info",
    title: "Belum ada tracker",
    description: `Belum ada channel YouTube yang dipantau di server ini.\nMulai dengan \`${prefix} addchannel @username #channel\` atau gunakan \`/addchannel\`.`
  });
}

function buildNotificationEmbed({ trackedChannel, latestVideo }) {
  const channelName = getVideoChannelName(trackedChannel, latestVideo);
  const embed = buildStatusEmbed({
    tone: resolveNotificationTone(latestVideo),
    title: buildEmbedVideoTitle(latestVideo),
    description: null,
    fields: [
      {
        name: "Channel",
        value: channelName,
        inline: true
      },
      {
        name: "Jenis Konten",
        value: latestVideo.contentLabel || (latestVideo.isShort ? "Shorts" : "Video Panjang"),
        inline: true
      },
      {
        name: "Link Video",
        value: buildVideoLinkFieldValue(latestVideo.link),
        inline: false
      },
      ...buildVideoTimingFields(latestVideo)
    ].filter(Boolean)
  })
    .setAuthor({ name: channelName })
    .setURL(latestVideo.link);

  return applyNotificationMediaLayout(embed, latestVideo, trackedChannel);
}

function buildCustomMessagePreview(messageTemplate) {
  return messageTemplate || DEFAULT_CUSTOM_MESSAGE;
}

function buildTitleWatchResultEmbed({ actionLabel, watch, prefix }) {
  return buildStatusEmbed({
    tone: "success",
    title: `Title Watch berhasil ${actionLabel}`,
    description: `Bot akan memantau keyword judul **${watch.keyword}** dari hasil pencarian YouTube lintas channel.`,
    footerText: `Prefix saat ini: ${prefix}`,
    fields: [
      {
        name: "Keyword",
        value: `\`${watch.keyword}\``,
        inline: true
      },
      {
        name: "Target Discord",
        value: [
          `Channel: <#${watch.channelId}>`,
          `Ping Role: ${watch.roleId ? `<@&${watch.roleId}>` : "Tidak ada"}`
        ].join("\n"),
        inline: true
      },
      {
        name: "Batas Umur Konten",
        value: `${watch.maxAgeDays || DEFAULT_TITLE_WATCH_MAX_AGE_DAYS} hari`,
        inline: true
      }
    ]
  });
}

function buildTitleWatchRemovedEmbed(watch, prefix) {
  return buildStatusEmbed({
    tone: "info",
    title: "Title Watch dihapus",
    description: `Keyword judul **${watch.keyword}** berhasil dihapus.`,
    footerText: `Prefix saat ini: ${prefix}`
  });
}

function buildTitleWatchNotFoundEmbed(prefix) {
  return buildStatusEmbed({
    tone: "warning",
    title: "Title Watch tidak ditemukan",
    description: "Bot tidak menemukan keyword title watch yang cocok di server ini.",
    footerText: `Gunakan ${prefix} listtitlewatches untuk mengecek daftar title watch aktif.`
  });
}

function buildTitleWatchListEmbed(titleWatches, prefix) {
  const maxVisible = 10;
  const visibleEntries = titleWatches.slice(0, maxVisible);
  const hiddenCount = Math.max(0, titleWatches.length - visibleEntries.length);

  return buildStatusEmbed({
    tone: "info",
    title: "Daftar Title Watch",
    description: `Total keyword aktif: **${titleWatches.length}**`,
    fields: [
      ...visibleEntries.map((watch, index) => ({
        name: `${index + 1}. ${truncateText(watch.keyword, 80)}`,
        value: [
          `Target: <#${watch.channelId}>${watch.roleId ? ` | Ping: <@&${watch.roleId}>` : ""}`,
          `Maks. Umur: ${watch.maxAgeDays || DEFAULT_TITLE_WATCH_MAX_AGE_DAYS} hari`,
          `Last Video: \`${watch.lastVideoId || "-"}\``
        ].join("\n"),
        inline: false
      })),
      ...(hiddenCount
        ? [{
            name: "Sisa Data",
            value: `${hiddenCount} title watch lainnya tidak ditampilkan agar embed tetap ringkas.`,
            inline: false
          }]
        : [])
    ],
    footerText: `Prefix saat ini: ${prefix}`
  });
}

function buildEmptyTitleWatchListEmbed(prefix) {
  return buildStatusEmbed({
    tone: "info",
    title: "Belum ada Title Watch",
    description: `Belum ada keyword judul global di server ini.\nGunakan \`${prefix} addtitlewatch "Frimawan" #channel --days ${DEFAULT_TITLE_WATCH_MAX_AGE_DAYS}\` atau slash \`/addtitlewatch\`.`
  });
}

function buildTitleWatchNotificationEmbed({ watch, trackedChannel, latestVideo }) {
  const channelName = getVideoChannelName(trackedChannel, latestVideo);
  const embed = buildStatusEmbed({
    tone: resolveNotificationTone(latestVideo),
    title: buildEmbedVideoTitle(latestVideo),
    description: `Keyword \`${watch.keyword}\` cocok dengan judul video baru.`,
    fields: [
      {
        name: "YouTube Channel",
        value: channelName,
        inline: true
      },
      {
        name: "Jenis Konten",
        value: latestVideo.contentLabel || (latestVideo.isShort ? "Shorts" : "Video Panjang"),
        inline: true
      },
      {
        name: "Link Video",
        value: buildVideoLinkFieldValue(latestVideo.link),
        inline: false
      },
      ...buildVideoTimingFields(latestVideo)
    ].filter(Boolean)
  })
    .setAuthor({ name: channelName })
    .setURL(latestVideo.link);

  return applyNotificationMediaLayout(embed, latestVideo, trackedChannel);
}

module.exports = {
  buildAccessDeniedEmbed,
  buildAccessGuardStatusEmbed,
  buildCommandErrorEmbed,
  buildCustomMessagePreview,
  buildEmptyListEmbed,
  buildEmptyTitleWatchListEmbed,
  buildDevLogChannelUpdatedEmbed,
  buildLogChannelUpdatedEmbed,
  buildNotificationEmbed,
  buildPrefixUpdatedEmbed,
  buildPreviewOnAddUpdatedEmbed,
  buildRateLimitEmbed,
  buildStatusEmbed,
  buildTrackerNotFoundEmbed,
  buildTrackerRemovedEmbed,
  buildTrackerResultEmbed,
  buildTitleWatchListEmbed,
  buildTitleWatchNotFoundEmbed,
  buildTitleWatchNotificationEmbed,
  buildTitleWatchRemovedEmbed,
  buildTitleWatchResultEmbed,
  buildValidationErrorEmbed,
  buildWhitelistUpdatedEmbed
};
