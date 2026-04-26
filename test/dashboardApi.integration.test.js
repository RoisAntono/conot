const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createApiServer } = require("../apps/dashboard-api/src/server");

const ENV_KEYS = [
  "DASHBOARD_API_HOST",
  "DASHBOARD_API_PORT",
  "DASHBOARD_API_BASE_URL",
  "DASHBOARD_WEB_ORIGIN",
  "DASHBOARD_AUTH_MODE",
  "DASHBOARD_MOCK_AUTO_LOGIN",
  "DASHBOARD_SESSION_FILE_PATH",
  "DASHBOARD_SESSION_TTL_MS",
  "DASHBOARD_MUTATION_RATE_WINDOW_MS",
  "DASHBOARD_MUTATION_RATE_MAX",
  "DASHBOARD_PREVIEW_RATE_WINDOW_MS",
  "DASHBOARD_PREVIEW_RATE_MAX",
  "DATA_FILE_PATH",
  "DASHBOARD_CONFIG_STORAGE_DRIVER",
  "DASHBOARD_SQLITE_FILE_PATH",
  "CONFIG_SERVICE_TOKEN",
  "DISCORD_TOKEN"
];

async function createApiTestContext() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "conot-dashboard-api-"));
  const dataFile = path.join(tempDir, "data.json");
  const sessionFile = path.join(tempDir, "sessions.json");
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  process.env.DASHBOARD_API_HOST = "127.0.0.1";
  process.env.DASHBOARD_API_PORT = "0";
  process.env.DASHBOARD_API_BASE_URL = "http://127.0.0.1:0";
  process.env.DASHBOARD_WEB_ORIGIN = "http://127.0.0.1:4320";
  process.env.DASHBOARD_AUTH_MODE = "mock";
  process.env.DASHBOARD_MOCK_AUTO_LOGIN = "false";
  process.env.DASHBOARD_SESSION_FILE_PATH = sessionFile;
  delete process.env.DASHBOARD_SESSION_TTL_MS;
  process.env.DASHBOARD_MUTATION_RATE_WINDOW_MS = "10000";
  process.env.DASHBOARD_MUTATION_RATE_MAX = "5";
  process.env.DASHBOARD_PREVIEW_RATE_WINDOW_MS = "10000";
  process.env.DASHBOARD_PREVIEW_RATE_MAX = "2";
  process.env.DATA_FILE_PATH = dataFile;
  process.env.DASHBOARD_CONFIG_STORAGE_DRIVER = "json";
  process.env.DASHBOARD_SQLITE_FILE_PATH = path.join(tempDir, "dashboard-config.sqlite");
  process.env.CONFIG_SERVICE_TOKEN = "test-config-token";
  delete process.env.DISCORD_TOKEN;

  const api = createApiServer();
  await new Promise((resolve) => api.server.listen(0, "127.0.0.1", resolve));
  const address = api.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    dataFile,
    async close() {
      await new Promise((resolve) => api.server.close(resolve));
      for (const key of ENV_KEYS) {
        if (previous[key] == null) {
          delete process.env[key];
        } else {
          process.env[key] = previous[key];
        }
      }
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  };
}

async function jsonRequest(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

function parseStateFromLoginUrl(loginUrl) {
  const url = new URL(String(loginUrl));
  return url.searchParams.get("state");
}

function extractSessionCookie(response) {
  const header = getSetCookieHeader(response);
  const cookie = String(header || "").split(";")[0].trim();
  if (!cookie) {
    throw new Error("Session cookie tidak ditemukan pada response callback.");
  }
  return cookie;
}

function getSetCookieHeader(response) {
  return response.headers.get("set-cookie")
    || (typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie()[0] : "");
}

async function createSession(baseUrl, { userId, username, guildIds, adminGuildIds }) {
  const login = await jsonRequest(baseUrl, "/v1/auth/discord/login");
  assert.equal(login.response.status, 200);
  assert.equal(login.payload?.ok, true);

  const state = parseStateFromLoginUrl(login.payload?.data?.loginUrl);
  assert.ok(state);

  const query = new URLSearchParams({
    state,
    user_id: userId,
    username,
    guild_ids: guildIds.join(","),
    admin_guild_ids: adminGuildIds.join(",")
  });

  const callback = await fetch(`${baseUrl}/v1/auth/discord/callback?${query.toString()}`, {
    redirect: "manual"
  });
  assert.equal(callback.status, 302);
  assert.match(getSetCookieHeader(callback), /Max-Age=604800/);
  assert.match(getSetCookieHeader(callback), /Expires=/);
  const cookie = extractSessionCookie(callback);

  const me = await jsonRequest(baseUrl, "/v1/auth/me", {
    headers: { cookie }
  });
  assert.equal(me.response.status, 200);
  assert.equal(me.payload?.ok, true);
  assert.match(getSetCookieHeader(me.response), /Max-Age=604800/);

  return {
    cookie,
    csrfToken: me.payload?.data?.csrfToken,
    session: me.payload?.data
  };
}

test("dashboard-api integration: OAuth callback mock membuat sesi aktif", async () => {
  const ctx = await createApiTestContext();
  try {
    const session = await createSession(ctx.baseUrl, {
      userId: "100000000000000001",
      username: "tester",
      guildIds: ["111111111111111111", "222222222222222222"],
      adminGuildIds: ["111111111111111111"]
    });

    assert.equal(Boolean(session.cookie), true);
    assert.equal(Boolean(session.csrfToken), true);
    assert.equal(session.session.user.id, "100000000000000001");
    assert.equal(Array.isArray(session.session.guilds), true);
    assert.equal(session.session.guilds.length, 2);
  } finally {
    await ctx.close();
  }
});

test("dashboard-api integration: guild discord channels endpoint mengembalikan payload aman saat bot token kosong", async () => {
  const ctx = await createApiTestContext();
  try {
    const guildId = "111111111111111111";
    const session = await createSession(ctx.baseUrl, {
      userId: "100000000000000005",
      username: "channel-reader",
      guildIds: [guildId],
      adminGuildIds: [guildId]
    });

    const channels = await jsonRequest(
      ctx.baseUrl,
      `/v1/guilds/${guildId}/discord/channels`,
      {
        headers: { cookie: session.cookie }
      }
    );

    assert.equal(channels.response.status, 200);
    assert.equal(channels.payload?.ok, true);
    assert.equal(channels.payload?.data?.guildId, guildId);
    assert.equal(Array.isArray(channels.payload?.data?.channels), true);
  } finally {
    await ctx.close();
  }
});

test("dashboard-api integration: guild discord roles endpoint aman saat bot token kosong", async () => {
  const ctx = await createApiTestContext();
  try {
    const guildId = "111111111111111112";
    const session = await createSession(ctx.baseUrl, {
      userId: "100000000000000007",
      username: "role-reader",
      guildIds: [guildId],
      adminGuildIds: [guildId]
    });

    const roles = await jsonRequest(
      ctx.baseUrl,
      `/v1/guilds/${guildId}/discord/roles`,
      {
        headers: { cookie: session.cookie }
      }
    );

    assert.equal(roles.response.status, 200);
    assert.equal(roles.payload?.ok, true);
    assert.equal(roles.payload?.data?.guildId, guildId);
    assert.equal(Array.isArray(roles.payload?.data?.roles), true);
    assert.equal(roles.payload.data.roles.length, 0);
  } finally {
    await ctx.close();
  }
});

test("dashboard-api integration: youtube resolve menerima channel ID tanpa network live", async () => {
  const ctx = await createApiTestContext();
  try {
    const guildId = "111111111111111113";
    const session = await createSession(ctx.baseUrl, {
      userId: "100000000000000008",
      username: "youtube-resolver",
      guildIds: [guildId],
      adminGuildIds: [guildId]
    });

    const channelId = "UCaaaaaaaaaaaaaaaaaaaaaa";
    const resolved = await jsonRequest(ctx.baseUrl, `/v1/guilds/${guildId}/youtube/resolve`, {
      method: "POST",
      headers: {
        cookie: session.cookie,
        "content-type": "application/json",
        "x-csrf-token": session.csrfToken
      },
      body: JSON.stringify({ source: channelId })
    });

    assert.equal(resolved.response.status, 200);
    assert.equal(resolved.payload?.ok, true);
    assert.equal(resolved.payload?.data?.channelId, channelId);
    assert.equal(resolved.payload?.data?.username, channelId);
    assert.equal(resolved.payload?.data?.latestVideo, null);
  } finally {
    await ctx.close();
  }
});

test("dashboard-api integration: RBAC menolak mutasi jika user bukan MANAGE_GUILD", async () => {
  const ctx = await createApiTestContext();
  try {
    const session = await createSession(ctx.baseUrl, {
      userId: "100000000000000002",
      username: "rbac-user",
      guildIds: ["333333333333333333"],
      adminGuildIds: []
    });

    const createTracker = await jsonRequest(ctx.baseUrl, "/v1/guilds/333333333333333333/trackers", {
      method: "POST",
      headers: {
        cookie: session.cookie,
        "content-type": "application/json",
        "x-csrf-token": session.csrfToken
      },
      body: JSON.stringify({
        youtube: {
          username: "@sample",
          channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
          title: "Sample Channel"
        },
        discord: {
          channelId: "444444444444444444",
          roleId: null
        },
        notifications: {
          contentFilter: "all",
          embedLayout: "compact",
          customMessage: null,
          titleFilters: []
        }
      })
    });

    assert.equal(createTracker.response.status, 403);
    assert.equal(createTracker.payload?.ok, false);
    assert.equal(createTracker.payload?.error?.code, "FORBIDDEN_PERMISSION");
  } finally {
    await ctx.close();
  }
});

test("dashboard-api integration: mutation rate limit memblokir burst update settings", async () => {
  const ctx = await createApiTestContext();
  try {
    const guildId = "344444444444444444";
    const session = await createSession(ctx.baseUrl, {
      userId: "100000000000000006",
      username: "rate-limit-user",
      guildIds: [guildId],
      adminGuildIds: [guildId]
    });

    let blocked = null;
    for (let i = 0; i < 7; i += 1) {
      const response = await jsonRequest(ctx.baseUrl, `/v1/guilds/${guildId}/settings`, {
        method: "PATCH",
        headers: {
          cookie: session.cookie,
          "content-type": "application/json",
          "x-csrf-token": session.csrfToken
        },
        body: JSON.stringify({
          prefix: `!${i}`
        })
      });

      if (response.response.status === 429) {
        blocked = response;
        break;
      }
    }

    assert.ok(blocked, "Harus ada request yang diblokir oleh rate limit.");
    assert.equal(blocked.response.status, 429);
    assert.equal(blocked.payload?.error?.code, "RATE_LIMITED");
  } finally {
    await ctx.close();
  }
});

test("dashboard-api integration: create tracker mem-publish event stream", async () => {
  const ctx = await createApiTestContext();
  try {
    const guildId = "555555555555555555";
    const session = await createSession(ctx.baseUrl, {
      userId: "100000000000000003",
      username: "event-user",
      guildIds: [guildId],
      adminGuildIds: [guildId]
    });

    const created = await jsonRequest(ctx.baseUrl, `/v1/guilds/${guildId}/trackers`, {
      method: "POST",
      headers: {
        cookie: session.cookie,
        "content-type": "application/json",
        "x-csrf-token": session.csrfToken
      },
      body: JSON.stringify({
        youtube: {
          username: "@eventchannel",
          channelId: "UCbbbbbbbbbbbbbbbbbbbbbb",
          title: "Event Channel"
        },
        discord: {
          channelId: "666666666666666666",
          roleId: null
        },
        notifications: {
          contentFilter: "all",
          embedLayout: "compact",
          customMessage: null,
          titleFilters: []
        }
      })
    });

    assert.equal(created.response.status, 201);
    assert.equal(created.payload?.ok, true);
    assert.equal(Boolean(created.payload?.data?.id), true);
    assert.equal(Boolean(created.payload?.data?.configUpdatedAt), true);
    assert.equal(created.payload?.data?.stateUpdatedAt, null);
    assert.equal(created.payload?.data?.lastCheckedAt, null);

    const firstEvent = await jsonRequest(
      ctx.baseUrl,
      "/v1/internal/events/next?afterSeq=0&timeoutMs=1000",
      {
        headers: {
          authorization: "Bearer test-config-token"
        }
      }
    );
    assert.equal(firstEvent.response.status, 200);
    assert.equal(firstEvent.payload?.ok, true);
    assert.equal(firstEvent.payload?.data?.event?.topic, "tracker.created");

    const secondEvent = await jsonRequest(
      ctx.baseUrl,
      `/v1/internal/events/next?afterSeq=${firstEvent.payload?.data?.event?.seq}&timeoutMs=1000`,
      {
        headers: {
          authorization: "Bearer test-config-token"
        }
      }
    );
    assert.equal(secondEvent.response.status, 200);
    assert.equal(secondEvent.payload?.ok, true);
    assert.equal(secondEvent.payload?.data?.event?.topic, "config.updated");
  } finally {
    await ctx.close();
  }
});

test("dashboard-api e2e smoke: login -> guild -> create tracker -> send preview", async () => {
  const ctx = await createApiTestContext();
  try {
    const guildId = "777777777777777777";
    const session = await createSession(ctx.baseUrl, {
      userId: "100000000000000004",
      username: "smoke-user",
      guildIds: [guildId],
      adminGuildIds: [guildId]
    });

    const guilds = await jsonRequest(ctx.baseUrl, "/v1/guilds", {
      headers: { cookie: session.cookie }
    });
    assert.equal(guilds.response.status, 200);
    assert.equal(guilds.payload?.ok, true);
    assert.equal(Array.isArray(guilds.payload?.data), true);
    assert.equal(guilds.payload.data.some((item) => item.id === guildId), true);

    const tracker = await jsonRequest(ctx.baseUrl, `/v1/guilds/${guildId}/trackers`, {
      method: "POST",
      headers: {
        cookie: session.cookie,
        "content-type": "application/json",
        "x-csrf-token": session.csrfToken
      },
      body: JSON.stringify({
        youtube: {
          username: "@smoke",
          channelId: "UCcccccccccccccccccccccc",
          title: "Smoke Channel"
        },
        discord: {
          channelId: "888888888888888888",
          roleId: null
        },
        notifications: {
          contentFilter: "all",
          embedLayout: "compact",
          customMessage: null,
          titleFilters: []
        }
      })
    });
    assert.equal(tracker.response.status, 201);
    assert.equal(tracker.payload?.ok, true);

    const preview = await jsonRequest(ctx.baseUrl, `/v1/guilds/${guildId}/preview/send-test`, {
      method: "POST",
      headers: {
        cookie: session.cookie,
        "content-type": "application/json",
        "x-csrf-token": session.csrfToken
      },
      body: JSON.stringify({
        trackerId: tracker.payload?.data?.id
      })
    });
    assert.equal(preview.response.status, 200);
    assert.equal(preview.payload?.ok, true);
    assert.equal(preview.payload?.data?.accepted, true);

    const logs = await jsonRequest(ctx.baseUrl, `/v1/guilds/${guildId}/logs`, {
      headers: { cookie: session.cookie }
    });
    assert.equal(logs.response.status, 200);
    assert.equal(logs.payload?.ok, true);
    assert.equal(
      logs.payload?.data?.some((item) => item.scope === "preview" && item.message.includes("Test preview")),
      true
    );
  } finally {
    await ctx.close();
  }
});

test("dashboard-api integration: notification history endpoint mengembalikan riwayat terbaru per guild", async () => {
  const ctx = await createApiTestContext();
  try {
    const guildId = "999999999999999999";
    const session = await createSession(ctx.baseUrl, {
      userId: "100000000000000099",
      username: "history-user",
      guildIds: [guildId],
      adminGuildIds: [guildId]
    });

    const raw = await fs.readFile(ctx.dataFile, "utf8");
    const data = JSON.parse(raw || "{}");
    data.notificationHistory = [
      {
        id: "history-1",
        guildId,
        source: "tracker",
        status: "sent",
        event: "new",
        title: "Video A",
        videoId: "vid-a",
        createdAt: "2026-04-19T09:00:00.000Z"
      },
      {
        id: "history-2",
        guildId: "888888888888888888",
        source: "tracker",
        status: "sent",
        event: "new",
        title: "Video B",
        videoId: "vid-b",
        createdAt: "2026-04-19T09:01:00.000Z"
      },
      {
        id: "history-3",
        guildId,
        source: "titlewatch",
        status: "failed",
        event: "new",
        title: "Video C",
        videoId: "vid-c",
        createdAt: "2026-04-19T09:02:00.000Z"
      }
    ];
    await fs.writeFile(ctx.dataFile, JSON.stringify(data, null, 2), "utf8");

    const history = await jsonRequest(
      ctx.baseUrl,
      `/v1/guilds/${guildId}/notifications?source=tracker&status=sent&limit=50`,
      {
        headers: { cookie: session.cookie }
      }
    );

    assert.equal(history.response.status, 200);
    assert.equal(history.payload?.ok, true);
    assert.equal(Array.isArray(history.payload?.data), true);
    assert.equal(history.payload.data.length, 1);
    assert.equal(history.payload.data[0].id, "history-1");
  } finally {
    await ctx.close();
  }
});

test("dashboard-api integration: logs/audit/notification query mendukung q + rentang waktu + filter tambahan", async () => {
  const ctx = await createApiTestContext();
  try {
    const guildId = "121212121212121212";
    const session = await createSession(ctx.baseUrl, {
      userId: "100000000000000120",
      username: "query-user",
      guildIds: [guildId],
      adminGuildIds: [guildId]
    });

    const raw = await fs.readFile(ctx.dataFile, "utf8");
    const data = JSON.parse(raw || "{}");
    data.guildLogs = [
      {
        id: "log-1",
        guildId,
        level: "error",
        scope: "Tracker",
        message: "Permission channel kurang",
        meta: { channelId: "123" },
        createdAt: "2026-04-20T10:00:00.000Z"
      },
      {
        id: "log-2",
        guildId,
        level: "warn",
        scope: "Tracker",
        message: "Notifikasi dilewati",
        meta: { channelId: "123" },
        createdAt: "2026-04-10T10:00:00.000Z"
      }
    ];
    data.auditLogs = [
      {
        id: "audit-1",
        guildId,
        actorUserId: "200000000000000001",
        action: "tracker.updated",
        resourceType: "tracker",
        resourceId: "tracker-1",
        before: { channelId: "old" },
        after: { channelId: "new" },
        createdAt: "2026-04-20T11:00:00.000Z"
      },
      {
        id: "audit-2",
        guildId,
        actorUserId: "200000000000000002",
        action: "settings.updated",
        resourceType: "setting",
        resourceId: guildId,
        before: { prefix: "?n" },
        after: { prefix: "!" },
        createdAt: "2026-04-01T11:00:00.000Z"
      }
    ];
    data.notificationHistory = [
      {
        id: "notif-1",
        guildId,
        source: "tracker",
        status: "sent",
        event: "new",
        title: "Video permission update",
        videoId: "vid-1",
        createdAt: "2026-04-20T09:00:00.000Z"
      },
      {
        id: "notif-2",
        guildId,
        source: "titlewatch",
        status: "failed",
        event: "new",
        title: "Video lama",
        videoId: "vid-2",
        createdAt: "2026-03-01T09:00:00.000Z"
      }
    ];
    await fs.writeFile(ctx.dataFile, JSON.stringify(data, null, 2), "utf8");

    const logs = await jsonRequest(
      ctx.baseUrl,
      `/v1/guilds/${guildId}/logs?level=error&q=permission&from=2026-04-19T00:00:00.000Z&to=2026-04-21T00:00:00.000Z&limit=10`,
      {
        headers: { cookie: session.cookie }
      }
    );
    assert.equal(logs.response.status, 200);
    assert.equal(logs.payload?.ok, true);
    assert.equal(logs.payload?.data?.length, 1);
    assert.equal(logs.payload?.data?.[0]?.id, "log-1");

    const audit = await jsonRequest(
      ctx.baseUrl,
      `/v1/guilds/${guildId}/audit-logs?resourceType=tracker&actorUserId=200000000000000001&q=channel&from=2026-04-19T00:00:00.000Z&to=2026-04-21T00:00:00.000Z&limit=50`,
      {
        headers: { cookie: session.cookie }
      }
    );
    assert.equal(audit.response.status, 200);
    assert.equal(audit.payload?.ok, true);
    assert.equal(audit.payload?.data?.length, 1);
    assert.equal(audit.payload?.data?.[0]?.id, "audit-1");

    const notifications = await jsonRequest(
      ctx.baseUrl,
      `/v1/guilds/${guildId}/notifications?source=tracker&q=permission&from=2026-04-19T00:00:00.000Z&to=2026-04-21T00:00:00.000Z&limit=50`,
      {
        headers: { cookie: session.cookie }
      }
    );
    assert.equal(notifications.response.status, 200);
    assert.equal(notifications.payload?.ok, true);
    assert.equal(notifications.payload?.data?.length, 1);
    assert.equal(notifications.payload?.data?.[0]?.id, "notif-1");
  } finally {
    await ctx.close();
  }
});

test("dashboard-api integration: export endpoint logs/audit/notifications mengembalikan attachment csv/json", async () => {
  const ctx = await createApiTestContext();
  try {
    const guildId = "131313131313131313";
    const session = await createSession(ctx.baseUrl, {
      userId: "100000000000000131",
      username: "export-user",
      guildIds: [guildId],
      adminGuildIds: [guildId]
    });

    const raw = await fs.readFile(ctx.dataFile, "utf8");
    const data = JSON.parse(raw || "{}");
    data.guildLogs = [
      {
        id: "log-export-1",
        guildId,
        level: "error",
        scope: "Tracker",
        message: "Exportable log",
        createdAt: "2026-04-20T10:00:00.000Z"
      }
    ];
    data.auditLogs = [
      {
        id: "audit-export-1",
        guildId,
        actorUserId: "200000000000000013",
        action: "tracker.updated",
        resourceType: "tracker",
        resourceId: "tracker-13",
        before: { roleId: null },
        after: { roleId: "123" },
        createdAt: "2026-04-20T10:10:00.000Z"
      }
    ];
    data.notificationHistory = [
      {
        id: "notif-export-1",
        guildId,
        source: "tracker",
        status: "sent",
        event: "new",
        title: "Exportable notif",
        videoId: "vid-export",
        createdAt: "2026-04-20T10:20:00.000Z"
      }
    ];
    await fs.writeFile(ctx.dataFile, JSON.stringify(data, null, 2), "utf8");

    const csvLogs = await fetch(
      `${ctx.baseUrl}/v1/guilds/${guildId}/logs/export?format=csv&limit=10`,
      { headers: { cookie: session.cookie } }
    );
    assert.equal(csvLogs.status, 200);
    assert.match(csvLogs.headers.get("content-type") || "", /text\/csv/i);
    assert.match(csvLogs.headers.get("content-disposition") || "", /attachment/i);
    const csvLogsText = await csvLogs.text();
    assert.match(csvLogsText, /Exportable log/);

    const jsonAudit = await fetch(
      `${ctx.baseUrl}/v1/guilds/${guildId}/audit-logs/export?format=json&limit=10`,
      { headers: { cookie: session.cookie } }
    );
    assert.equal(jsonAudit.status, 200);
    assert.match(jsonAudit.headers.get("content-type") || "", /application\/json/i);
    const jsonAuditPayload = JSON.parse(await jsonAudit.text());
    assert.equal(Array.isArray(jsonAuditPayload), true);
    assert.equal(jsonAuditPayload[0].id, "audit-export-1");

    const csvNotif = await fetch(
      `${ctx.baseUrl}/v1/guilds/${guildId}/notifications/export?format=csv&limit=10`,
      { headers: { cookie: session.cookie } }
    );
    assert.equal(csvNotif.status, 200);
    assert.match(csvNotif.headers.get("content-type") || "", /text\/csv/i);
    const csvNotifText = await csvNotif.text();
    assert.match(csvNotifText, /Exportable notif/);
  } finally {
    await ctx.close();
  }
});
