"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

async function buildHealthSnapshot(options) {
  const { repository, guildId, startedAt } = options;
  const dataStats = await repository.getDataFileStats();
  const storageInfo =
    typeof repository.getStorageInfo === "function"
      ? repository.getStorageInfo()
      : { driver: "json", filePath: null };
  const db = await repository.read();
  const trackers = (db.trackedChannels || []).filter((tracker) => tracker?.discord?.guildId === guildId);
  const guildSetting = (db.guildSettings || []).find((item) => item.guildId === guildId) || null;

  return {
    runtime: {
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      rssMemoryMb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(2)),
      heapUsedMb: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2))
    },
    config: {
      trackerCount: trackers.length,
      titleWatchCount: (guildSetting?.titleWatches || []).length,
      prefix: guildSetting?.prefix || "?n",
      previewOnAdd: guildSetting?.previewOnAdd !== false
    },
    storage: {
      driver: storageInfo.driver || "json",
      resourceName: storageInfo.filePath ? path.basename(storageInfo.filePath) : null,
      dataFileExists: dataStats.exists,
      dataFileSizeKb: dataStats.exists ? Number((dataStats.size / 1024).toFixed(2)) : 0,
      dataFileModifiedAt: dataStats.mtime || null
    }
  };
}

async function getFileStats(path) {
  try {
    const stat = await fs.stat(path);
    return {
      exists: true,
      size: stat.size,
      mtime: stat.mtime.toISOString()
    };
  } catch {
    return {
      exists: false,
      size: 0,
      mtime: null
    };
  }
}

module.exports = {
  buildHealthSnapshot,
  getFileStats
};
