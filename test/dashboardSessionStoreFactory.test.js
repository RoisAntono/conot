const test = require("node:test");
const assert = require("node:assert/strict");
const { createSessionStore } = require("../apps/dashboard-api/src/auth/sessionStoreFactory");
const { SessionStore } = require("../apps/dashboard-api/src/auth/sessionStore");
const { RedisSessionStore } = require("../apps/dashboard-api/src/auth/redisSessionStore");

test("session store factory default ke file session store", () => {
  const store = createSessionStore({
    env: {
      sessionStoreDriver: "file",
      sessionTtlMs: 60_000,
      sessionFilePath: "data/test-session-store.json"
    }
  });

  assert.equal(store instanceof SessionStore, true);
});

test("session store factory melempar error jika redis tanpa url", () => {
  assert.throws(
    () =>
      createSessionStore({
        env: {
          sessionStoreDriver: "redis",
          sessionTtlMs: 60_000,
          sessionRedisUrl: ""
        }
      }),
    /DASHBOARD_SESSION_STORE=redis membutuhkan DASHBOARD_REDIS_URL/
  );
});

test("session store factory menolak driver yang tidak dikenal", () => {
  assert.throws(
    () =>
      createSessionStore({
        env: {
          sessionStoreDriver: "unknown-driver"
        }
      }),
    /DASHBOARD_SESSION_STORE tidak valid/
  );
});

test("session store factory mengembalikan redis store saat driver redis valid", () => {
  const store = createSessionStore({
    env: {
      sessionStoreDriver: "redis",
      sessionTtlMs: 60_000,
      sessionRedisUrl: "redis://127.0.0.1:6379",
      sessionRedisPrefix: "conot:test"
    }
  });

  assert.equal(store instanceof RedisSessionStore, true);
});
