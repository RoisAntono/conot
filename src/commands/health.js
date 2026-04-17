const fs = require("node:fs/promises");
const path = require("node:path");
const {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const {
  DATA_FILE,
  MAX_TITLE_WATCHES_PER_GUILD,
  MAX_TRACKERS_PER_GUILD,
  SETTINGS_COMMAND_RATE_LIMIT_MS
} = require("../config/constants");
const { getAccessControl, isGuildAuthorized, isOwnerUser } = require("../services/accessGuardService");
const { getCanaryStatus } = require("../services/canaryService");
const { getLogChannelIdForGuild } = require("../services/logChannelService");
const { getPrefixForGuild } = require("../services/prefixService");
const { getPreviewOnAddForGuild } = require("../services/previewService");
const { listTitleWatches } = require("../services/titleWatchService");
const { listTrackedChannels } = require("../services/trackerService");
const { getPollerStatus } = require("../services/youtubePoller");
const { getDataBackupStatus } = require("../services/dataBackupService");
const { getCurrentDataSchemaVersion } = require("../utils/fileDb");

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const parts = [];

  if (days) {
    parts.push(`${days}d`);
  }

  if (hours || parts.length) {
    parts.push(`${hours}h`);
  }

  if (minutes || parts.length) {
    parts.push(`${minutes}m`);
  }

  parts.push(`${remainingSeconds}s`);
  return parts.join(" ");
}

function formatTimestamp(value) {
  if (!value) {
    return "Belum ada";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Belum ada";
  }

  const unixSeconds = Math.floor(date.getTime() / 1000);
  return `<t:${unixSeconds}:F> (<t:${unixSeconds}:R>)`;
}

function formatBytes(value) {
  const bytes = Number(value) || 0;

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function getDataFileStatus() {
  try {
    const stats = await fs.stat(DATA_FILE);
    return {
      exists: true,
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString()
    };
  } catch {
    return {
      exists: false,
      sizeBytes: 0,
      modifiedAt: null
    };
  }
}

function getMemoryStatus() {
  const memory = process.memoryUsage();

  return {
    rss: memory.rss,
    heapTotal: memory.heapTotal,
    heapUsed: memory.heapUsed,
    external: memory.external
  };
}

function resolveHealthToneColor({ pollerStatus, guildAuthorized, memoryStatus }) {
  if (!guildAuthorized || pollerStatus.lastCycleStatus === "error") {
    return 0xef4444;
  }

  const rssMb = (Number(memoryStatus?.rss) || 0) / (1024 * 1024);
  if (!pollerStatus.active || pollerStatus.lastCycleStatus === "running" || rssMb >= 800) {
    return 0xf59e0b;
  }

  return 0x22c55e;
}

function buildHealthEmbed({
  guild,
  prefix,
  trackedChannels,
  titleWatches,
  previewOnAdd,
  logChannelId,
  pollerStatus,
  accessControl,
  guildAuthorized,
  dataFileStatus,
  memoryStatus,
  backupStatus,
  canaryStatus,
  client,
  isDevView
}) {
  const embed = new EmbedBuilder()
    .setColor(resolveHealthToneColor({ pollerStatus, guildAuthorized, memoryStatus }))
    .setTitle("Health / Status")
    .setDescription(isDevView
      ? "Status runtime bot, poller, konfigurasi guild, dan komponen internal."
      : "Status operasional bot untuk guild ini.")
    .addFields(
      {
        name: "Runtime",
        value: [
          `Bot: ${client.user?.tag || "Unknown"}`,
          `Uptime: ${formatDuration(process.uptime())}`,
          `WS Ping: ${client.ws.ping >= 0 ? `${client.ws.ping} ms` : "N/A"}`,
          `Guild Terhubung: ${client.guilds.cache.size}`,
          `RSS Memory: ${formatBytes(memoryStatus.rss)}`,
          `Heap Used: ${formatBytes(memoryStatus.heapUsed)} / ${formatBytes(memoryStatus.heapTotal)}`
        ].join("\n"),
        inline: false
      },
      {
        name: "Poller",
        value: [
          `Aktif: ${pollerStatus.active ? "Ya" : "Tidak"}`,
          `Sedang Jalan: ${pollerStatus.isRunning ? "Ya" : "Tidak"}`,
          `Interval: ${Math.floor((pollerStatus.intervalMs || 0) / 60000)} menit`,
          `Status Terakhir: ${pollerStatus.lastCycleStatus || "unknown"}`,
          `Total Siklus: ${pollerStatus.cycleCount || 0}`
        ].join("\n"),
        inline: true
      },
      {
        name: "Guild Ini",
        value: [
          `Nama: ${guild?.name || "Unknown Guild"}`,
          `ID: \`${guild?.id || "unknown"}\``,
          `Authorized: ${guildAuthorized ? "Ya" : "Tidak"}`,
          `Prefix: \`${prefix}\``
        ].join("\n"),
        inline: true
      },
      {
        name: "Konfigurasi",
        value: [
          `Tracker: ${trackedChannels.length} / ${MAX_TRACKERS_PER_GUILD}`,
          `Title Watch: ${titleWatches.length} / ${MAX_TITLE_WATCHES_PER_GUILD}`,
          `Preview On Add: ${previewOnAdd ? "Aktif" : "Nonaktif"}`,
          `Log Channel: ${logChannelId ? `<#${logChannelId}>` : "Tidak ada"}`
        ].join("\n"),
        inline: true
      },
      {
        name: "Siklus Terakhir",
        value: [
          `Mulai: ${formatTimestamp(pollerStatus.lastCycleStartedAt)}`,
          `Selesai: ${formatTimestamp(pollerStatus.lastCycleFinishedAt)}`,
          `Tracker Diproses: ${pollerStatus.lastCycleTrackedCount || 0}`,
          `Guild Diproses: ${pollerStatus.lastCycleGuildCount || 0}`,
          `Error Terakhir: ${pollerStatus.lastCycleError ? `\`${pollerStatus.lastCycleError}\`` : "Tidak ada"}`
        ].join("\n"),
        inline: false
      }
    )
    .setFooter({ text: `Gunakan ${prefix} setlogchannel untuk log dan ${prefix} setguard untuk guard instance.` })
    .setTimestamp();

  if (isDevView) {
    embed.addFields(
      {
        name: "Storage",
        value: [
          `Schema Version: v${getCurrentDataSchemaVersion()}`,
          `data.json: ${dataFileStatus.exists ? "Ada" : "Tidak ada"}`,
          `Ukuran: ${formatBytes(dataFileStatus.sizeBytes)}`,
          `Modified: ${formatTimestamp(dataFileStatus.modifiedAt)}`,
          `External Memory: ${formatBytes(memoryStatus.external)}`
        ].join("\n"),
        inline: false
      },
      {
        name: "Backup",
        value: [
          `Scheduler: ${backupStatus.active ? "Aktif" : "Nonaktif"}`,
          `Interval: ${Math.floor((backupStatus.intervalMs || 0) / 60000)} menit`,
          `Retensi: ${backupStatus.retention} file`,
          `Total Backup: ${backupStatus.fileCount} (${formatBytes(backupStatus.totalSizeBytes)})`,
          `Backup Terakhir: ${formatTimestamp(backupStatus.lastBackupAt)}`,
          `File Terakhir: ${backupStatus.lastBackupFile ? `\`${path.basename(backupStatus.lastBackupFile)}\`` : "Belum ada"}`,
          `Durasi Terakhir: ${backupStatus.lastBackupDurationMs || 0} ms`,
          `Error Terakhir: ${backupStatus.lastBackupError ? `\`${backupStatus.lastBackupError}\`` : "Tidak ada"}`
        ].join("\n"),
        inline: false
      },
      {
        name: "Canary",
        value: [
          `Enabled: ${canaryStatus.enabled ? "Ya" : "Tidak"}`,
          `Scheduler: ${canaryStatus.active ? "Aktif" : "Nonaktif"}`,
          `Status: ${canaryStatus.lastStatus || "unknown"}`,
          `Handles: ${canaryStatus.handles?.length || 0}`,
          `Siklus: ${canaryStatus.cycleCount || 0}`,
          `Run Terakhir: ${formatTimestamp(canaryStatus.lastRunAt)}`,
          `Error Terakhir: ${canaryStatus.lastError ? `\`${canaryStatus.lastError}\`` : "Tidak ada"}`
        ].join("\n"),
        inline: false
      },
      {
        name: "Access Guard",
        value: [
          `Guild Whitelist: ${accessControl.guildWhitelistEnabled ? "Aktif" : "Nonaktif"}`,
          `User Whitelist: ${accessControl.userWhitelistEnabled ? "Aktif" : "Nonaktif"}`,
          `Auto Leave: ${accessControl.leaveUnauthorizedGuilds ? "Aktif" : "Nonaktif"}`
        ].join("\n"),
        inline: false
      }
    );
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("health")
    .setDescription("Lihat status runtime bot, poller, dan konfigurasi guild ini.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  prefix: {
    name: "health",
    aliases: ["status", "botstatus"],
    usage: "health"
  },
  requiredPermissions: PermissionFlagsBits.ManageGuild,
  rateLimitMs: SETTINGS_COMMAND_RATE_LIMIT_MS,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const devView = isOwnerUser(interaction.user?.id);

    const [
      prefix,
      trackedChannels,
      titleWatches,
      previewOnAdd,
      logChannelId,
      accessControl,
      guildAuthorized,
      memoryStatus
    ] = await Promise.all([
      getPrefixForGuild(interaction.guildId),
      listTrackedChannels(interaction.guildId),
      listTitleWatches(interaction.guildId),
      getPreviewOnAddForGuild(interaction.guildId),
      getLogChannelIdForGuild(interaction.guildId),
      getAccessControl(),
      isGuildAuthorized(interaction.guildId),
      Promise.resolve(getMemoryStatus())
    ]);

    const dataFileStatus = devView
      ? await getDataFileStatus()
      : { exists: false, sizeBytes: 0, modifiedAt: null };
    const backupStatus = devView
      ? await getDataBackupStatus()
      : {
          active: false,
          intervalMs: 0,
          retention: 0,
          fileCount: 0,
          totalSizeBytes: 0,
          lastBackupAt: null,
          lastBackupFile: null,
          lastBackupDurationMs: 0,
          lastBackupError: null
        };
    const canaryStatus = devView
      ? getCanaryStatus()
      : {
          enabled: false,
          active: false,
          lastStatus: "hidden",
          handles: [],
          cycleCount: 0,
          lastRunAt: null,
          lastError: null
        };

    await interaction.editReply({
      embeds: [
        buildHealthEmbed({
          guild: interaction.guild,
          prefix,
          trackedChannels,
          titleWatches,
          previewOnAdd,
          logChannelId,
          pollerStatus: getPollerStatus(),
          accessControl,
          guildAuthorized,
          dataFileStatus,
          memoryStatus,
          backupStatus,
          canaryStatus,
          client: interaction.client,
          isDevView: devView
        })
      ]
    });
  },
  async executePrefix(message, args, context) {
    const devView = isOwnerUser(message.author?.id);

    const [
      trackedChannels,
      titleWatches,
      previewOnAdd,
      logChannelId,
      accessControl,
      guildAuthorized,
      memoryStatus
    ] = await Promise.all([
      listTrackedChannels(message.guild.id),
      listTitleWatches(message.guild.id),
      getPreviewOnAddForGuild(message.guild.id),
      getLogChannelIdForGuild(message.guild.id),
      getAccessControl(),
      isGuildAuthorized(message.guild.id),
      Promise.resolve(getMemoryStatus())
    ]);

    const dataFileStatus = devView
      ? await getDataFileStatus()
      : { exists: false, sizeBytes: 0, modifiedAt: null };
    const backupStatus = devView
      ? await getDataBackupStatus()
      : {
          active: false,
          intervalMs: 0,
          retention: 0,
          fileCount: 0,
          totalSizeBytes: 0,
          lastBackupAt: null,
          lastBackupFile: null,
          lastBackupDurationMs: 0,
          lastBackupError: null
        };
    const canaryStatus = devView
      ? getCanaryStatus()
      : {
          enabled: false,
          active: false,
          lastStatus: "hidden",
          handles: [],
          cycleCount: 0,
          lastRunAt: null,
          lastError: null
        };

    await message.reply({
      embeds: [
        buildHealthEmbed({
          guild: message.guild,
          prefix: context.prefix,
          trackedChannels,
          titleWatches,
          previewOnAdd,
          logChannelId,
          pollerStatus: getPollerStatus(),
          accessControl,
          guildAuthorized,
          dataFileStatus,
          memoryStatus,
          backupStatus,
          canaryStatus,
          client: message.client,
          isDevView: devView
        })
      ]
    });
  }
};
