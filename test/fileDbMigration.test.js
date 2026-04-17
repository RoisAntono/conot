const test = require("node:test");
const assert = require("node:assert/strict");
const { __private } = require("../src/utils/fileDb");

test("migrateData upgrades legacy schema to latest version", () => {
  const input = {
    guildSettings: [],
    trackedChannels: [
      {
        youtube: {
          username: "@example",
          channelId: "UC1234567890123456789012"
        },
        discord: {
          guildId: "123456789012345678",
          channelId: "234567890123456789"
        },
        notifications: {
          contentFilter: "all",
          titleFilter: "dr tirta, dr gia"
        }
      }
    ]
  };

  const migration = __private.migrateData(input);

  assert.equal(migration.changed, true);
  assert.equal(migration.toVersion >= 4, true);
  assert.equal(migration.data.dataVersion, migration.toVersion);
  assert.deepEqual(
    migration.data.trackedChannels[0].notifications.titleFilters,
    ["dr tirta", "dr gia"]
  );
  assert.deepEqual(
    migration.data.trackedChannels[0].recentSeenVideoIds || [],
    []
  );
  assert.equal(migration.data.globalSettings?.logging?.devLogChannelId, null);
  assert.equal(migration.data.globalSettings?.logging?.devLogLevel, "warn");
  assert.equal(migration.data.globalSettings?.logging?.userIncludeErrorStack, false);
});
