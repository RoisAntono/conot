const {
  CANARY_ENABLED,
  CANARY_FAILURE_THRESHOLD,
  CANARY_INTERVAL_MS
} = require("../config/constants");
const { broadcastGlobalLog } = require("./botLogService");
const { fetchLatestVideo } = require("../utils/rssChecker");
const { classifyNetworkError } = require("../utils/networkRetry");
const { scrapeYouTubeChannel } = require("../utils/youtubeScraper");
const logger = require("../utils/logger");

let canaryTimer = null;
let canaryBootTimeout = null;
let canaryRunning = false;
let canaryStartedAt = null;
let canaryLastRunAt = null;
let canaryLastStatus = "idle";
let canaryLastError = null;
let canaryCycleCount = 0;
const canaryFailureState = new Map();

function parseCanaryHandles() {
  return String(process.env.CANARY_HANDLES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getFailureRecord(handle) {
  return canaryFailureState.get(handle) || {
    consecutiveFailures: 0,
    lastError: null,
    lastFailedAt: null,
    lastSucceededAt: null
  };
}

function rememberCanaryFailure(handle, error) {
  const current = getFailureRecord(handle);
  const next = {
    consecutiveFailures: current.consecutiveFailures + 1,
    lastError: error?.message || String(error),
    lastFailedAt: new Date().toISOString(),
    lastSucceededAt: current.lastSucceededAt
  };
  canaryFailureState.set(handle, next);
  return next;
}

function rememberCanarySuccess(handle) {
  const current = getFailureRecord(handle);
  canaryFailureState.set(handle, {
    consecutiveFailures: 0,
    lastError: null,
    lastFailedAt: current.lastFailedAt,
    lastSucceededAt: new Date().toISOString()
  });
}

async function runCanaryForHandle(handle) {
  const resolved = await scrapeYouTubeChannel(handle);
  const latestVideo = await fetchLatestVideo(resolved.channelId);
  return {
    handle,
    channelId: resolved.channelId,
    latestVideoId: latestVideo?.videoId || null
  };
}

async function runCanaryCycle() {
  if (canaryRunning) {
    return;
  }

  canaryRunning = true;
  canaryLastRunAt = new Date().toISOString();
  canaryLastStatus = "running";
  canaryLastError = null;

  try {
    const handles = parseCanaryHandles();
    if (!CANARY_ENABLED || !handles.length) {
      canaryLastStatus = "skipped";
      return;
    }

    for (const handle of handles) {
      try {
        await runCanaryForHandle(handle);
        rememberCanarySuccess(handle);
      } catch (error) {
        const failure = rememberCanaryFailure(handle, error);
        const classification = classifyNetworkError(error);

        if (failure.consecutiveFailures >= CANARY_FAILURE_THRESHOLD) {
          await broadcastGlobalLog({
            level: "error",
            scope: "Canary",
            title: "Canary check gagal berulang",
            description: `Canary scraping untuk ${handle} gagal ${failure.consecutiveFailures}x berturut-turut.`,
            logSignature: `canary-failure:${handle.toLowerCase()}`,
            details: [
              {
                name: "Handle",
                value: `\`${handle}\``,
                inline: true
              },
              {
                name: "Error Type",
                value: classification.isTransient ? "Transient" : "Permanent",
                inline: true
              },
              {
                name: "Status/Code",
                value: `status=\`${classification.status || "-"}\` code=\`${classification.code || "-"}\``,
                inline: false
              }
            ],
            error
          });
        } else {
          logger.warn(`Canary sementara gagal untuk ${handle} (${failure.consecutiveFailures}/${CANARY_FAILURE_THRESHOLD}).`, error);
        }
      }
    }

    canaryCycleCount += 1;
    canaryLastStatus = "success";
  } catch (error) {
    canaryLastStatus = "error";
    canaryLastError = error?.message || String(error);
    logger.warn("Canary cycle gagal.", error);
  } finally {
    canaryRunning = false;
  }
}

function startCanaryScheduler() {
  stopCanaryScheduler();

  if (!CANARY_ENABLED) {
    logger.info("Canary scheduler nonaktif.");
    return;
  }

  if (!Number.isFinite(CANARY_INTERVAL_MS) || CANARY_INTERVAL_MS < 60 * 1000) {
    logger.warn("Canary scheduler nonaktif karena CANARY_INTERVAL_MS tidak valid.");
    return;
  }

  canaryStartedAt = new Date().toISOString();
  canaryBootTimeout = setTimeout(() => {
    runCanaryCycle().catch(() => null);
  }, 15000);

  canaryTimer = setInterval(() => {
    runCanaryCycle().catch(() => null);
  }, CANARY_INTERVAL_MS);

  logger.info(`Canary scheduler aktif. Interval ${Math.floor(CANARY_INTERVAL_MS / 60000)} menit.`);
}

function stopCanaryScheduler() {
  if (canaryBootTimeout) {
    clearTimeout(canaryBootTimeout);
    canaryBootTimeout = null;
  }

  if (canaryTimer) {
    clearInterval(canaryTimer);
    canaryTimer = null;
  }
}

function getCanaryStatus() {
  const handles = parseCanaryHandles();
  const failures = handles.map((handle) => ({
    handle,
    ...getFailureRecord(handle)
  }));

  return {
    enabled: CANARY_ENABLED,
    active: Boolean(canaryTimer),
    isRunning: canaryRunning,
    intervalMs: CANARY_INTERVAL_MS,
    startedAt: canaryStartedAt,
    lastRunAt: canaryLastRunAt,
    lastStatus: canaryLastStatus,
    lastError: canaryLastError,
    cycleCount: canaryCycleCount,
    handles,
    failures
  };
}

module.exports = {
  getCanaryStatus,
  runCanaryCycle,
  startCanaryScheduler,
  stopCanaryScheduler
};
