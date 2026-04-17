const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const backupDrillScript = require("../scripts/backup-drill");
const restoreScript = require("../scripts/restore-backup");

test("restore-backup parseArgs mengenali flag latest, file, dan dry-run", () => {
  const parsed = restoreScript.__private.parseArgs([
    "node",
    "scripts/restore-backup.js",
    "--latest",
    "--file",
    "data-20260417-010101.json",
    "--dry-run"
  ]);

  assert.equal(parsed.latest, true);
  assert.equal(parsed.file, "data-20260417-010101.json");
  assert.equal(parsed.dryRun, true);
});

test("restore-backup isBackupFileName memvalidasi pola nama backup", () => {
  assert.equal(restoreScript.__private.isBackupFileName("data-20260417-010101.json"), true);
  assert.equal(restoreScript.__private.isBackupFileName("backup.json"), false);
});

test("restore-backup validateBackupJson mengembalikan object JSON valid", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "conot-restore-test-"));
  const tempFile = path.join(tempDir, "sample-backup.json");
  await fs.writeFile(tempFile, JSON.stringify({ ok: true, count: 1 }), "utf8");

  const parsed = await restoreScript.__private.validateBackupJson(tempFile);
  assert.deepEqual(parsed, { ok: true, count: 1 });
});

test("backup-drill verifyRestoreSimulation gagal jika JSON backup rusak", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "conot-backup-test-"));
  const brokenFile = path.join(tempDir, "broken.json");
  await fs.writeFile(brokenFile, "{invalid-json", "utf8");

  await assert.rejects(
    backupDrillScript.__private.verifyRestoreSimulation(brokenFile),
    /Unexpected token|JSON/
  );
});
