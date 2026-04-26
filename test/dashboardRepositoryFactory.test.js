const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createConfigRepository, resolveDataFilePath } = require("../apps/dashboard-api/src/repositories/repositoryFactory");
const { JsonConfigRepository } = require("../apps/dashboard-api/src/repositories/jsonConfigRepository");
const { SqliteConfigRepository } = require("../apps/dashboard-api/src/repositories/sqliteConfigRepository");

test("repository factory: relative DATA_FILE_PATH diarahkan ke root project", () => {
  const expected = path.resolve(__dirname, "..", "data", "data.json");
  assert.equal(resolveDataFilePath({ dataFilePath: "data/data.json" }), expected);
});

test("repository factory: default json driver", () => {
  const repo = createConfigRepository({
    configStorageDriver: "json",
    dataFilePath: "data/data.json"
  });

  assert.equal(repo instanceof JsonConfigRepository, true);
  assert.equal(repo.getStorageInfo().driver, "json");
});

test("repository factory: sqlite driver bootstrap dari data json", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "conot-repo-factory-"));
  const sourceJsonPath = path.join(tempDir, "data.json");
  const sqlitePath = path.join(tempDir, "dashboard.sqlite");
  const guildId = "191919191919191919";

  await fs.writeFile(
    sourceJsonPath,
    JSON.stringify(
      {
        guildSettings: [
          {
            guildId,
            prefix: "?x",
            titleWatches: [],
            previewOnAdd: true,
            logChannelId: null,
            logLevel: "warn",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ],
        trackedChannels: [
          {
            id: "tracker-source",
            youtube: {
              username: "@demo",
              channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
              title: "Demo Channel"
            },
            discord: {
              guildId,
              channelId: "292929292929292929",
              roleId: null
            },
            notifications: {
              contentFilter: "all",
              embedLayout: "compact",
              customMessage: null,
              titleFilters: []
            },
            lastVideoId: "video-1",
            lastVideoUrl: null,
            lastPublishedAt: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const repo = createConfigRepository({
    configStorageDriver: "sqlite",
    dataFilePath: sourceJsonPath,
    sqliteFilePath: sqlitePath
  });

  try {
    assert.equal(repo instanceof SqliteConfigRepository, true);
    const settings = await repo.getGuildSettings(guildId);
    assert.equal(settings?.prefix, "?x");

    const trackers = await repo.listTrackers(guildId);
    assert.equal(trackers.length, 1);
    assert.equal(trackers[0].youtube?.username, "@demo");
    assert.equal(trackers[0].configUpdatedAt, "2026-01-01T00:00:00.000Z");
    assert.equal(trackers[0].lastCheckedAt, "2026-01-01T00:00:00.000Z");

    await repo.upsertGuildSettings(guildId, { prefix: "!" }, "100000000000000010");
    const refreshed = await repo.getGuildSettings(guildId);
    assert.equal(refreshed?.prefix, "!");

    const sourceRaw = await fs.readFile(sourceJsonPath, "utf8");
    const sourceData = JSON.parse(sourceRaw || "{}");
    assert.equal(sourceData.guildSettings?.[0]?.prefix, "?x");

    const sqliteStats = await fs.stat(sqlitePath);
    assert.equal(sqliteStats.isFile(), true);
  } finally {
    repo.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
