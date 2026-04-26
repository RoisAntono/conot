"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { getFileStats } = require("../services/healthService");
const { JsonConfigRepository, defaultDb, ensureShape } = require("./jsonConfigRepository");

function loadSqliteModule() {
  try {
    return require("node:sqlite");
  } catch (error) {
    throw new Error(
      "Driver sqlite membutuhkan runtime Node.js yang mendukung node:sqlite. Gunakan DASHBOARD_CONFIG_STORAGE_DRIVER=json jika runtime belum mendukung."
    );
  }
}

class SqliteConfigRepository extends JsonConfigRepository {
  constructor(options = {}) {
    super({
      dataFilePath: options.bootstrapJsonFilePath || options.sqliteFilePath
    });

    this.sqliteFilePath = options.sqliteFilePath;
    this.bootstrapJsonFilePath = options.bootstrapJsonFilePath || null;
    this.db = null;
    this.initialized = false;

    if (!this.sqliteFilePath) {
      throw new Error("sqliteFilePath wajib diisi untuk SqliteConfigRepository.");
    }
  }

  ensureDatabaseOpen() {
    if (this.db) {
      return;
    }

    const { DatabaseSync } = loadSqliteModule();
    this.db = new DatabaseSync(this.sqliteFilePath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  async loadSeedData() {
    const fallback = defaultDb();
    if (!this.bootstrapJsonFilePath) {
      return fallback;
    }

    try {
      await fs.access(this.bootstrapJsonFilePath);
      const raw = await fs.readFile(this.bootstrapJsonFilePath, "utf8");
      const parsed = JSON.parse(raw || "{}");
      return ensureShape(parsed);
    } catch {
      return fallback;
    }
  }

  async ensureFile() {
    await fs.mkdir(path.dirname(this.sqliteFilePath), { recursive: true });
    this.ensureDatabaseOpen();

    if (this.initialized) {
      return;
    }

    const row = this.db.prepare("SELECT value FROM config_store WHERE key = ?").get("config");
    if (!row) {
      const seed = await this.loadSeedData();
      const now = new Date().toISOString();
      this.db
        .prepare("INSERT INTO config_store (key, value, updated_at) VALUES (?, ?, ?)")
        .run("config", JSON.stringify(seed), now);
    }

    this.initialized = true;
  }

  async read() {
    await this.ensureFile();
    const row = this.db.prepare("SELECT value FROM config_store WHERE key = ?").get("config");
    if (!row?.value) {
      return defaultDb();
    }

    try {
      const parsed = JSON.parse(row.value || "{}");
      return ensureShape(parsed);
    } catch {
      return defaultDb();
    }
  }

  async write(data) {
    await this.ensureFile();
    const now = new Date().toISOString();
    const serialized = JSON.stringify(ensureShape(data));
    this.db
      .prepare(`
        INSERT INTO config_store (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `)
      .run("config", serialized, now);
  }

  async getDataFileStats() {
    return getFileStats(this.sqliteFilePath);
  }

  getStorageInfo() {
    return {
      driver: "sqlite",
      filePath: this.sqliteFilePath
    };
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}

module.exports = {
  SqliteConfigRepository
};
