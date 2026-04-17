const fs = require("node:fs/promises");
const path = require("node:path");
const {
  DATA_BACKUP_DIR,
  DATA_BACKUP_INTERVAL_MS,
  DATA_BACKUP_RETENTION,
  DATA_FILE
} = require("../config/constants");
const logger = require("../utils/logger");

let backupTimer = null;
let backupBootTimeout = null;
let lastBackupAt = null;
let lastBackupFile = null;
let lastBackupError = null;
let lastBackupDurationMs = 0;
let backupCount = 0;

function normalizeRetention(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : 30;
}

function formatBackupTimestamp(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const second = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function isBackupFileName(fileName) {
  return /^data-\d{8}-\d{6}\.json$/i.test(String(fileName || "").trim());
}

async function ensureBackupDirectory() {
  await fs.mkdir(DATA_BACKUP_DIR, { recursive: true });
}

async function getBackupFiles() {
  await ensureBackupDirectory();
  const entries = await fs.readdir(DATA_BACKUP_DIR, { withFileTypes: true });

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isBackupFileName(entry.name)) {
      continue;
    }

    const fullPath = path.join(DATA_BACKUP_DIR, entry.name);
    const stats = await fs.stat(fullPath);
    files.push({
      name: entry.name,
      fullPath,
      mtimeMs: stats.mtimeMs,
      sizeBytes: stats.size
    });
  }

  return files.sort((left, right) => right.name.localeCompare(left.name));
}

async function pruneOldBackups(retention = DATA_BACKUP_RETENTION) {
  const normalizedRetention = normalizeRetention(retention);
  const files = await getBackupFiles();
  const expired = files.slice(normalizedRetention);

  for (const item of expired) {
    await fs.unlink(item.fullPath).catch(() => null);
  }
}

async function createDataBackup(reason = "scheduled") {
  const startedAt = Date.now();
  await ensureBackupDirectory();

  const targetFile = path.join(DATA_BACKUP_DIR, `data-${formatBackupTimestamp()}.json`);
  await fs.copyFile(DATA_FILE, targetFile);
  await pruneOldBackups(DATA_BACKUP_RETENTION);

  backupCount += 1;
  lastBackupAt = new Date().toISOString();
  lastBackupFile = targetFile;
  lastBackupError = null;
  lastBackupDurationMs = Date.now() - startedAt;

  logger.info(`Backup data.json selesai (${reason}) -> ${path.basename(targetFile)}`);
  return targetFile;
}

async function runBackupCycle(reason) {
  try {
    await createDataBackup(reason);
  } catch (error) {
    lastBackupError = error?.message || String(error);
    logger.warn("Backup data.json gagal dijalankan.", error);
  }
}

function startDataBackupScheduler() {
  stopDataBackupScheduler();

  if (!Number.isFinite(DATA_BACKUP_INTERVAL_MS) || DATA_BACKUP_INTERVAL_MS < 60 * 1000) {
    logger.warn("Scheduler backup dimatikan karena DATA_BACKUP_INTERVAL_MS tidak valid.");
    return;
  }

  backupBootTimeout = setTimeout(() => {
    runBackupCycle("startup").catch(() => null);
  }, 10000);

  backupTimer = setInterval(() => {
    runBackupCycle("scheduled").catch(() => null);
  }, DATA_BACKUP_INTERVAL_MS);

  logger.info(`Scheduler backup aktif. Interval ${Math.floor(DATA_BACKUP_INTERVAL_MS / 60000)} menit.`);
}

function stopDataBackupScheduler() {
  if (backupBootTimeout) {
    clearTimeout(backupBootTimeout);
    backupBootTimeout = null;
  }

  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
}

async function getDataBackupStatus() {
  let files = [];
  try {
    files = await getBackupFiles();
  } catch {
    files = [];
  }

  const totalSizeBytes = files.reduce((sum, item) => sum + item.sizeBytes, 0);

  return {
    active: Boolean(backupTimer),
    intervalMs: DATA_BACKUP_INTERVAL_MS,
    retention: normalizeRetention(DATA_BACKUP_RETENTION),
    directory: DATA_BACKUP_DIR,
    fileCount: files.length,
    totalSizeBytes,
    lastBackupAt,
    lastBackupFile,
    lastBackupError,
    lastBackupDurationMs,
    runtimeBackupCount: backupCount
  };
}

module.exports = {
  createDataBackup,
  getDataBackupStatus,
  startDataBackupScheduler,
  stopDataBackupScheduler
};
