const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEnv } = require("../apps/dashboard-api/src/config/env");

const KEYS = [
  "DASHBOARD_AUTH_MODE",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DASHBOARD_SESSION_TTL_MS",
  "DASHBOARD_SESSION_STORE",
  "DASHBOARD_REDIS_URL",
  "DASHBOARD_REDIS_PREFIX",
  "DASHBOARD_CONFIG_STORAGE_DRIVER",
  "DASHBOARD_SQLITE_FILE_PATH"
];

function withEnv(overrides, fn) {
  const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      const value = overrides[key];
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = String(value);
      }
    } else {
      delete process.env[key];
    }
  }

  try {
    return fn();
  } finally {
    for (const key of KEYS) {
      if (previous[key] == null) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test("dashboard env default authMode menjadi discord jika credential OAuth tersedia", () => {
  withEnv(
    {
      DISCORD_CLIENT_ID: "123456789012345678",
      DISCORD_CLIENT_SECRET: "secret-value",
      DASHBOARD_AUTH_MODE: null
    },
    () => {
      const env = loadEnv();
      assert.equal(env.authMode, "discord");
    }
  );
});

test("dashboard env tetap menghormati DASHBOARD_AUTH_MODE saat diset explicit", () => {
  withEnv(
    {
      DISCORD_CLIENT_ID: "123456789012345678",
      DISCORD_CLIENT_SECRET: "secret-value",
      DASHBOARD_AUTH_MODE: "mock"
    },
    () => {
      const env = loadEnv();
      assert.equal(env.authMode, "mock");
    }
  );
});

test("dashboard env default session store driver adalah file", () => {
  withEnv(
    {
      DASHBOARD_SESSION_STORE: null
    },
    () => {
      const env = loadEnv();
      assert.equal(env.sessionStoreDriver, "file");
    }
  );
});

test("dashboard env default session TTL adalah tujuh hari", () => {
  withEnv(
    {
      DASHBOARD_SESSION_TTL_MS: null
    },
    () => {
      const env = loadEnv();
      assert.equal(env.sessionTtlMs, 1000 * 60 * 60 * 24 * 7);
    }
  );
});

test("dashboard env membaca konfigurasi redis session store", () => {
  withEnv(
    {
      DASHBOARD_SESSION_STORE: "redis",
      DASHBOARD_REDIS_URL: "redis://127.0.0.1:6379",
      DASHBOARD_REDIS_PREFIX: "conot:test"
    },
    () => {
      const env = loadEnv();
      assert.equal(env.sessionStoreDriver, "redis");
      assert.equal(env.sessionRedisUrl, "redis://127.0.0.1:6379");
      assert.equal(env.sessionRedisPrefix, "conot:test");
    }
  );
});

test("dashboard env default storage driver adalah json", () => {
  withEnv(
    {
      DASHBOARD_CONFIG_STORAGE_DRIVER: null,
      DASHBOARD_SQLITE_FILE_PATH: null
    },
    () => {
      const env = loadEnv();
      assert.equal(env.configStorageDriver, "json");
      assert.equal(env.sqliteFilePath, "data/dashboard-config.sqlite");
    }
  );
});

test("dashboard env membaca konfigurasi storage driver sqlite", () => {
  withEnv(
    {
      DASHBOARD_CONFIG_STORAGE_DRIVER: "sqlite",
      DASHBOARD_SQLITE_FILE_PATH: "data/custom.sqlite"
    },
    () => {
      const env = loadEnv();
      assert.equal(env.configStorageDriver, "sqlite");
      assert.equal(env.sqliteFilePath, "data/custom.sqlite");
    }
  );
});
