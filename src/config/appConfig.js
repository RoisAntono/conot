const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_WORKSPACE_ROOT = path.resolve(__dirname, "../..");

let cachedConfig = null;
let cachedConfigPath = null;

function getWorkspaceRoot() {
  const configured = String(process.env.CONOT_WORKSPACE_ROOT || "").trim();
  if (configured) {
    return path.resolve(configured);
  }
  return DEFAULT_WORKSPACE_ROOT;
}

function resolveAppPath(targetPath, fallbackPath = "") {
  const normalized = String(targetPath || fallbackPath || "").trim();
  if (!normalized) {
    return getWorkspaceRoot();
  }

  if (path.isAbsolute(normalized)) {
    return normalized;
  }

  return path.resolve(getWorkspaceRoot(), normalized);
}

function resolveConfigPath() {
  const rawPath = String(process.env.CONOT_CONFIG_PATH || "").trim();
  if (!rawPath) {
    return path.join(getWorkspaceRoot(), "config", "app.config.json");
  }
  return resolveAppPath(rawPath);
}

function readAppConfig() {
  const configPath = resolveConfigPath();
  if (cachedConfig && cachedConfigPath === configPath) {
    return cachedConfig;
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    cachedConfig = JSON.parse(raw || "{}");
    cachedConfigPath = configPath;
    return cachedConfig;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw new Error(`Gagal membaca config ${configPath}: ${error.message}`);
    }
    cachedConfig = {};
    cachedConfigPath = configPath;
    return cachedConfig;
  }
}

function getConfigPath(pathKey) {
  if (!pathKey) {
    return undefined;
  }

  return String(pathKey)
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => {
      if (current == null || typeof current !== "object") {
        return undefined;
      }
      return current[key];
    }, readAppConfig());
}

function hasEnvValue(envName) {
  return Boolean(envName) && process.env[envName] !== undefined && process.env[envName] !== "";
}

function getRawConfigValue(pathKey, envName, fallback) {
  if (hasEnvValue(envName)) {
    return process.env[envName];
  }

  const configValue = getConfigPath(pathKey);
  return configValue === undefined || configValue === null ? fallback : configValue;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseList(value, fallback = []) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getConfigString(pathKey, envName, fallback = "") {
  const value = getRawConfigValue(pathKey, envName, fallback);
  return value === undefined || value === null ? fallback : String(value);
}

function getConfigNumber(pathKey, envName, fallback) {
  const value = Number(getRawConfigValue(pathKey, envName, fallback));
  return Number.isFinite(value) ? value : fallback;
}

function getConfigBoolean(pathKey, envName, fallback = false) {
  return parseBoolean(getRawConfigValue(pathKey, envName, fallback), fallback);
}

function getConfigList(pathKey, envName, fallback = []) {
  return parseList(getRawConfigValue(pathKey, envName, fallback), fallback);
}

function clearAppConfigCache() {
  cachedConfig = null;
  cachedConfigPath = null;
}

module.exports = {
  clearAppConfigCache,
  getConfigBoolean,
  getConfigList,
  getConfigNumber,
  getConfigString,
  getWorkspaceRoot,
  resolveAppPath,
  readAppConfig
};
