const { TITLE_WATCH_SEARCH_LIMIT } = require("../config/constants");
const { formatNotificationMessage } = require("./rssChecker");
const { formatTitleWatchNotification } = require("./titleWatchFormatter");
const { isVideoWithinMaxAgeDays } = require("./videoAge");
const { searchYouTubeVideos } = require("./youtubeSearchScraper");

function buildStatusReason(statusLabel, lines) {
  return [
    `**Status:** ${statusLabel}`,
    ...lines
  ].join("\n");
}

async function sendTrackerSetupPreview(targetChannel, trackedEntry, latestVideo) {
  if (!latestVideo || !targetChannel?.isTextBased()) {
    return {
      sent: false,
      reason: buildStatusReason("Preview tidak dijalankan", [
        "Video baseline atau channel target preview tidak tersedia."
      ])
    };
  }

  try {
    await targetChannel.send(
      formatNotificationMessage(trackedEntry, latestVideo, {
        contentPrefix: "[SETUP PREVIEW]",
        suppressRoleMention: true
      })
    );

    return {
      sent: true,
      reason: buildStatusReason("Preview berhasil dikirim", [
        `Contoh notifikasi dikirim ke <#${targetChannel.id}> untuk verifikasi format dan permission.`
      ])
    };
  } catch {
    return {
      sent: false,
      reason: buildStatusReason("Preview gagal dikirim", [
        `Tidak bisa mengirim preview ke <#${targetChannel.id}>. Pastikan izin kirim pesan dan embed aktif.`
      ])
    };
  }
}

async function findTitleWatchSetupPreviewCandidate(keyword, maxAgeDays) {
  const searchResults = await searchYouTubeVideos(keyword, TITLE_WATCH_SEARCH_LIMIT);
  const eligibleResults = searchResults.filter((video) => isVideoWithinMaxAgeDays(video, maxAgeDays));
  const latestVideo = eligibleResults[0] || null;

  if (!latestVideo) {
    return null;
  }

  return {
    trackedChannel: {
      youtube: {
        username: latestVideo.channelHandle || latestVideo.channelTitle,
        title: latestVideo.channelTitle
      },
      notifications: {
        embedLayout: "compact"
      }
    },
    latestVideo,
    recentVideoIds: eligibleResults.map((video) => video.videoId).filter(Boolean),
    publishedAt: new Date(latestVideo.publishedAt || 0).getTime()
  };
}

async function sendTitleWatchSetupPreview(targetChannel, watch, trackedChannel, latestVideo) {
  if (!latestVideo || !trackedChannel || !targetChannel?.isTextBased()) {
    return {
      sent: false,
      reason: watch?.maxAgeDays
        ? buildStatusReason("Tidak ada preview nyata untuk dikirim", [
            `Tidak ditemukan video, stream, atau premiere yang judulnya cocok dalam ${watch.maxAgeDays} hari terakhir.`,
            "Title watch tetap aktif dan notifikasi akan dikirim saat ada konten baru yang memenuhi kriteria."
          ])
        : buildStatusReason("Tidak ada preview nyata untuk dikirim", [
            "Belum ada hasil pencarian YouTube yang cocok dengan keyword ini untuk dijadikan preview."
          ])
    };
  }

  try {
    await targetChannel.send(
      formatTitleWatchNotification(watch, trackedChannel, latestVideo, {
        contentPrefix: "[SETUP PREVIEW]",
        messageText: `Keyword \`${watch.keyword}\` cocok dengan video terbaru yang sudah ada.`,
        suppressRoleMention: true
      })
    );

    return {
      sent: true,
      reason: buildStatusReason("Preview berhasil dikirim", [
        `Contoh hasil title watch dikirim ke <#${targetChannel.id}> menggunakan kandidat terbaru yang cocok.`
      ])
    };
  } catch {
    return {
      sent: false,
      reason: buildStatusReason("Preview gagal dikirim", [
        `Kandidat ditemukan, tetapi preview gagal dikirim ke <#${targetChannel.id}>. Pastikan izin kirim pesan dan embed aktif.`
      ])
    };
  }
}

module.exports = {
  findTitleWatchSetupPreviewCandidate,
  sendTitleWatchSetupPreview,
  sendTrackerSetupPreview
};
