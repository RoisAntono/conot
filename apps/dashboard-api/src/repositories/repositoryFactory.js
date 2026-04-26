"use strict";

const { resolveRuntimePath } = require("../lib/paths");
const { JsonConfigRepository } = require("./jsonConfigRepository");

function resolveStoragePath(targetPath, fallbackPath) {
  return resolveRuntimePath(targetPath, fallbackPath || "data/data.json");
}

function resolveDataFilePath(env) {
  return resolveStoragePath(env.dataFilePath, "data/data.json");
}

function resolveSqliteFilePath(env) {
  return resolveStoragePath(env.sqliteFilePath, "data/dashboard-config.sqlite");
}

function createConfigRepository(env) {
  const driver = String(env.configStorageDriver || "json").toLowerCase();
  const dataFilePath = resolveDataFilePath(env);

  if (driver === "json") {
    return new JsonConfigRepository({ dataFilePath });
  }

  if (driver === "sqlite") {
    const sqliteFilePath = resolveSqliteFilePath(env);
    const { SqliteConfigRepository } = require("./sqliteConfigRepository");
    return new SqliteConfigRepository({
      sqliteFilePath,
      bootstrapJsonFilePath: dataFilePath
    });
  }

  throw new Error(
    `DASHBOARD_CONFIG_STORAGE_DRIVER tidak valid: ${driver}. Gunakan "json" atau "sqlite".`
  );
}

module.exports = {
  createConfigRepository,
  resolveDataFilePath,
  resolveSqliteFilePath
};
