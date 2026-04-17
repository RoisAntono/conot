const fs = require("node:fs/promises");
const path = require("node:path");
const { DATA_BACKUP_DIR, DATA_FILE } = require("../src/config/constants");

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    latest: false,
    file: null,
    dryRun: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === "--latest") {
      parsed.latest = true;
      continue;
    }

    if (token === "--file") {
      parsed.file = args[index + 1] || null;
      index += 1;
      continue;
    }

    if (token === "--dry-run") {
      parsed.dryRun = true;
    }
  }

  return parsed;
}

function isBackupFileName(fileName) {
  return /^data-\d{8}-\d{6}\.json$/i.test(String(fileName || "").trim());
}

async function listBackupFiles() {
  const entries = await fs.readdir(DATA_BACKUP_DIR, { withFileTypes: true }).catch(() => []);
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
      mtimeMs: stats.mtimeMs
    });
  }

  return files.sort((left, right) => right.name.localeCompare(left.name));
}

async function resolveBackupPath(options) {
  const files = await listBackupFiles();
  if (!files.length) {
    throw new Error("Tidak ada file backup yang tersedia.");
  }

  if (options.file) {
    const found = files.find((item) => item.name === options.file || item.fullPath === options.file);
    if (!found) {
      throw new Error(`Backup file tidak ditemukan: ${options.file}`);
    }
    return found.fullPath;
  }

  if (options.latest || !options.file) {
    return files[0].fullPath;
  }

  return files[0].fullPath;
}

async function validateBackupJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function backupCurrentDataBeforeRestore() {
  const restoreBackupPath = `${DATA_FILE}.pre-restore-${Date.now()}.json`;
  await fs.copyFile(DATA_FILE, restoreBackupPath);
  return restoreBackupPath;
}

async function main() {
  const options = parseArgs(process.argv);
  const backupPath = await resolveBackupPath(options);

  await validateBackupJson(backupPath);

  if (options.dryRun) {
    console.log("Dry-run restore sukses.");
    console.log(`- Source backup: ${backupPath}`);
    console.log(`- Data file tetap: ${DATA_FILE}`);
    return;
  }

  const currentBackup = await backupCurrentDataBeforeRestore();
  await fs.copyFile(backupPath, DATA_FILE);

  console.log("Restore berhasil.");
  console.log(`- Source backup: ${backupPath}`);
  console.log(`- Snapshot data lama: ${currentBackup}`);
  console.log(`- Restored data file: ${DATA_FILE}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Restore backup gagal.", error?.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  __private: {
    backupCurrentDataBeforeRestore,
    isBackupFileName,
    parseArgs,
    resolveBackupPath,
    validateBackupJson
  },
  main
};
