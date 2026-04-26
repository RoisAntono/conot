const {
  CONFIG_SERVICE_BASE_URL,
  CONFIG_SERVICE_TOKEN,
  CONFIG_SYNC_BOOTSTRAP_ON_READY,
  CONFIG_SYNC_ENABLED,
  CONFIG_SYNC_EVENT_POLL_TIMEOUT_MS,
  CONFIG_SYNC_EVENT_STREAM_ENABLED,
  CONFIG_SYNC_INTERVAL_MS
} = require("../config/constants");
const { readData, writeData } = require("../utils/fileDb");
const logger = require("../utils/logger");

let syncTimer = null;
let running = false;
let lastSyncAt = null;
let lastSyncStatus = "idle";
let lastSyncError = null;
let lastSignature = null;
let stopRequested = false;
let eventLoopRunning = false;
let eventLoopAbortController = null;
let lastEventSeq = 0;
let lastEventAt = null;
let lastEventTopic = null;
let eventStreamStatus = "idle";
let eventStreamError = null;

function buildTrackerKey(item) {
  return `${item?.discord?.guildId || "unknown"}:${item?.youtube?.channelId || "unknown"}`;
}

function mergeTrackerState(current, incoming) {
  return {
    ...current,
    ...incoming,
    youtube: {
      ...(current?.youtube || {}),
      ...(incoming?.youtube || {})
    },
    discord: {
      ...(current?.discord || {}),
      ...(incoming?.discord || {})
    },
    notifications: {
      ...(current?.notifications || {}),
      ...(incoming?.notifications || {})
    },
    lastVideoId: incoming?.lastVideoId ?? current?.lastVideoId ?? null,
    lastVideoUrl: incoming?.lastVideoUrl ?? current?.lastVideoUrl ?? null,
    lastPublishedAt: incoming?.lastPublishedAt ?? current?.lastPublishedAt ?? null,
    lastContentState: incoming?.lastContentState ?? current?.lastContentState ?? null,
    lastNotifiedVideoId: incoming?.lastNotifiedVideoId ?? current?.lastNotifiedVideoId ?? null,
    lastNotifiedContentState: incoming?.lastNotifiedContentState ?? current?.lastNotifiedContentState ?? null,
    lastNotificationSignature: incoming?.lastNotificationSignature ?? current?.lastNotificationSignature ?? null,
    lastNotificationAt: incoming?.lastNotificationAt ?? current?.lastNotificationAt ?? null,
    lastDeliveryAttemptSignature: incoming?.lastDeliveryAttemptSignature ?? current?.lastDeliveryAttemptSignature ?? null,
    lastDeliveryAttemptAt: incoming?.lastDeliveryAttemptAt ?? current?.lastDeliveryAttemptAt ?? null,
    recentSeenVideoIds: Array.isArray(incoming?.recentSeenVideoIds)
      ? incoming.recentSeenVideoIds
      : (current?.recentSeenVideoIds || [])
  };
}

function buildSyncSignature(data) {
  const trackerUpdated = (data.trackedChannels || [])
    .map((item) => `${buildTrackerKey(item)}:${item?.updatedAt || "-"}`)
    .sort()
    .join("|");
  const guildUpdated = (data.guildSettings || [])
    .map((item) => `${item?.guildId || "-"}:${item?.updatedAt || "-"}`)
    .sort()
    .join("|");
  return `${trackerUpdated}#${guildUpdated}`;
}

function mergeConfigData(current, incoming) {
  const currentTrackers = new Map((current.trackedChannels || []).map((item) => [buildTrackerKey(item), item]));
  const mergedTrackers = (incoming.trackedChannels || []).map((item) => {
    const key = buildTrackerKey(item);
    return mergeTrackerState(currentTrackers.get(key), item);
  });

  return {
    ...current,
    ...incoming,
    globalSettings: {
      ...(current.globalSettings || {}),
      ...(incoming.globalSettings || {})
    },
    guildSettings: Array.isArray(incoming.guildSettings) ? incoming.guildSettings : (current.guildSettings || []),
    trackedChannels: mergedTrackers
  };
}

async function fetchRemoteConfig() {
  const response = await fetch(`${CONFIG_SERVICE_BASE_URL}/v1/internal/config/export`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${CONFIG_SERVICE_TOKEN}`
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok || typeof payload?.data !== "object") {
    throw new Error(payload?.error?.message || `Config sync gagal (${response.status}).`);
  }

  return payload.data;
}

function buildEventUrl(afterSeq) {
  const query = new URLSearchParams({
    afterSeq: String(Number(afterSeq) || 0),
    timeoutMs: String(Math.max(1_000, Math.min(30_000, Number(CONFIG_SYNC_EVENT_POLL_TIMEOUT_MS) || 25_000)))
  });
  return `${CONFIG_SERVICE_BASE_URL}/v1/internal/events/next?${query.toString()}`;
}

async function fetchNextConfigEvent(afterSeq) {
  eventLoopAbortController = new AbortController();
  const response = await fetch(buildEventUrl(afterSeq), {
    method: "GET",
    headers: {
      authorization: `Bearer ${CONFIG_SERVICE_TOKEN}`
    },
    signal: eventLoopAbortController.signal
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error?.message || `Event stream gagal (${response.status}).`);
  }

  return {
    event: payload?.data?.event || null,
    latestSeq: Number(payload?.meta?.latestSeq || 0),
    timeout: Boolean(payload?.meta?.timeout)
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runConfigSync(reason = "interval") {
  if (!CONFIG_SYNC_ENABLED || !CONFIG_SERVICE_BASE_URL || !CONFIG_SERVICE_TOKEN) {
    return false;
  }

  if (running) {
    return false;
  }

  running = true;
  try {
    const [current, incoming] = await Promise.all([readData(), fetchRemoteConfig()]);
    const signature = buildSyncSignature(incoming);
    if (signature === lastSignature) {
      lastSyncStatus = "unchanged";
      lastSyncError = null;
      lastSyncAt = new Date().toISOString();
      return false;
    }

    const merged = mergeConfigData(current, incoming);
    await writeData(merged);
    lastSignature = signature;
    lastSyncStatus = "success";
    lastSyncError = null;
    lastSyncAt = new Date().toISOString();
    logger.info(`[config-sync] sinkronisasi berhasil (${reason}).`);
    return true;
  } catch (error) {
    lastSyncStatus = "error";
    lastSyncError = error?.message || String(error);
    lastSyncAt = new Date().toISOString();
    logger.warn("[config-sync] sinkronisasi gagal.", error);
    return false;
  } finally {
    running = false;
  }
}

function startDashboardConfigSync() {
  if (!CONFIG_SYNC_ENABLED) {
    return;
  }

  if (!CONFIG_SERVICE_BASE_URL || !CONFIG_SERVICE_TOKEN) {
    logger.warn("[config-sync] nonaktif: CONFIG_SERVICE_BASE_URL / CONFIG_SERVICE_TOKEN belum terisi.");
    return;
  }

  stopRequested = false;

  if (syncTimer) {
    clearInterval(syncTimer);
  }

  if (CONFIG_SYNC_BOOTSTRAP_ON_READY) {
    runConfigSync("startup").catch(() => null);
  }

  syncTimer = setInterval(() => {
    runConfigSync("interval").catch(() => null);
  }, Math.max(5_000, CONFIG_SYNC_INTERVAL_MS));

  if (typeof syncTimer.unref === "function") {
    syncTimer.unref();
  }

  if (CONFIG_SYNC_EVENT_STREAM_ENABLED) {
    startConfigEventLoop();
  }

  logger.info(
    `[config-sync] aktif. interval=${Math.max(5_000, CONFIG_SYNC_INTERVAL_MS)}ms, eventStream=${CONFIG_SYNC_EVENT_STREAM_ENABLED ? "on" : "off"}.`
  );
}

function stopDashboardConfigSync() {
  stopRequested = true;

  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }

  if (eventLoopAbortController) {
    eventLoopAbortController.abort();
    eventLoopAbortController = null;
  }
}

async function startConfigEventLoop() {
  if (eventLoopRunning || !CONFIG_SYNC_EVENT_STREAM_ENABLED) {
    return;
  }

  eventLoopRunning = true;
  eventStreamStatus = "running";
  eventStreamError = null;

  while (!stopRequested) {
    try {
      const next = await fetchNextConfigEvent(lastEventSeq);
      eventLoopAbortController = null;

      if (!next?.event) {
        eventStreamStatus = "waiting";
        if (next?.latestSeq > lastEventSeq) {
          lastEventSeq = next.latestSeq;
        }
        continue;
      }

      lastEventSeq = Number(next.event.seq) || lastEventSeq;
      lastEventAt = next.event.emittedAt || new Date().toISOString();
      lastEventTopic = next.event.topic || "unknown";
      eventStreamStatus = "event_received";
      eventStreamError = null;

      await runConfigSync(`event:${lastEventTopic}`);
    } catch (error) {
      if (stopRequested) {
        break;
      }

      eventStreamStatus = "error";
      eventStreamError = error?.message || String(error);
      logger.warn("[config-sync] event stream error.", error);
      await sleep(3_000);
    }
  }

  eventLoopRunning = false;
  if (!eventStreamError) {
    eventStreamStatus = "stopped";
  }
}

function getDashboardConfigSyncStatus() {
  return {
    enabled: CONFIG_SYNC_ENABLED,
    running,
    eventStreamEnabled: CONFIG_SYNC_EVENT_STREAM_ENABLED,
    eventStreamRunning: eventLoopRunning,
    eventStreamStatus,
    eventStreamError,
    lastEventSeq,
    lastEventTopic,
    lastEventAt,
    intervalMs: Math.max(5_000, CONFIG_SYNC_INTERVAL_MS),
    lastSyncAt,
    lastSyncStatus,
    lastSyncError
  };
}

module.exports = {
  getDashboardConfigSyncStatus,
  runConfigSync,
  startDashboardConfigSync,
  stopDashboardConfigSync
};
