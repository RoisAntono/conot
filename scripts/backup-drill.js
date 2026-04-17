const fs = require("node:fs/promises");
const path = require("node:path");
const { DATA_BACKUP_DIR, DATA_FILE } = require("../src/config/constants");
const { createDataBackup } = require("../src/services/dataBackupService");

async function getLatestBackupFile() {
  const entries = await fs.readdir(DATA_BACKUP_DIR, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    if (!/^data-\d{8}-\d{6}\.json$/i.test(entry.name)) {
      continue;
    }

    const fullPath = path.join(DATA_BACKUP_DIR, entry.name);
    const stats = await fs.stat(fullPath);
    files.push({
      fullPath,
      mtimeMs: stats.mtimeMs
    });
  }

  files.sort((left, right) => path.basename(right.fullPath).localeCompare(path.basename(left.fullPath)));
  return files[0]?.fullPath || null;
}

async function verifyRestoreSimulation(backupPath) {
  const raw = await fs.readFile(backupPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Backup JSON tidak valid.");
  }

  const simulationPath = `${DATA_FILE}.restore-drill-${Date.now()}.json`;
  await fs.copyFile(backupPath, simulationPath);
  await fs.unlink(simulationPath).catch(() => null);
}

async function main() {
  await createDataBackup("manual-drill");
  const latestBackup = await getLatestBackupFile();

  if (!latestBackup) {
    throw new Error("Backup drill gagal: file backup terbaru tidak ditemukan.");
  }

  await verifyRestoreSimulation(latestBackup);

  console.log("Backup drill sukses.");
  console.log(`- Latest backup: ${latestBackup}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Backup drill gagal.", error?.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  __private: {
    getLatestBackupFile,
    verifyRestoreSimulation
  },
  main
};
