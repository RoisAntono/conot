const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  clearAppConfigCache,
  getConfigBoolean,
  getConfigList,
  getConfigNumber,
  getConfigString,
  resolveAppPath
} = require("../src/config/appConfig");

const ENV_KEYS = ["CONOT_CONFIG_PATH", "CONOT_WORKSPACE_ROOT", "TEST_CONFIG_NUMBER"];

function withEnv(overrides, fn) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of ENV_KEYS) {
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

  clearAppConfigCache();
  try {
    return fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (previous[key] == null) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
    clearAppConfigCache();
  }
}

test("app config reads versioned config and keeps env override precedence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "conot-config-"));
  const configPath = path.join(tempDir, "app.config.json");

  try {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        feature: {
          enabled: true,
          count: 3,
          label: "from-config",
          items: ["alpha", "beta"]
        }
      })
    );

    withEnv({ CONOT_CONFIG_PATH: configPath, TEST_CONFIG_NUMBER: null }, () => {
      assert.equal(getConfigBoolean("feature.enabled", null, false), true);
      assert.equal(getConfigNumber("feature.count", "TEST_CONFIG_NUMBER", 0), 3);
      assert.equal(getConfigString("feature.label", null, ""), "from-config");
      assert.deepEqual(getConfigList("feature.items", null, []), ["alpha", "beta"]);

      process.env.TEST_CONFIG_NUMBER = "7";
      assert.equal(getConfigNumber("feature.count", "TEST_CONFIG_NUMBER", 0), 7);
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("app config resolves relative runtime paths from workspace root", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "conot-root-"));

  try {
    withEnv({ CONOT_WORKSPACE_ROOT: tempDir }, () => {
      assert.equal(resolveAppPath("data/data.json"), path.join(tempDir, "data", "data.json"));
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
