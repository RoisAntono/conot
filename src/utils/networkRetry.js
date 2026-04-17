const { RETRY_BASE_DELAY_MS } = require("../config/constants");

const TRANSIENT_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ERR_NETWORK"
]);

const TRANSIENT_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function getErrorCode(error) {
  return String(error?.code || "").trim().toUpperCase() || null;
}

function getHttpStatus(error) {
  const directStatus = Number(error?.response?.status || error?.statusCode || error?.status);
  if (Number.isInteger(directStatus)) {
    return directStatus;
  }

  const message = String(error?.message || "");
  const statusMatch = message.match(/\bstatus code\s+(\d{3})\b/i);
  if (statusMatch?.[1]) {
    const parsed = Number(statusMatch[1]);
    return Number.isInteger(parsed) ? parsed : null;
  }

  const axiosLikeMatch = message.match(/\bRequest failed with status code\s+(\d{3})\b/i);
  if (axiosLikeMatch?.[1]) {
    const parsed = Number(axiosLikeMatch[1]);
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
}

function classifyNetworkError(error) {
  const code = getErrorCode(error);
  const status = getHttpStatus(error);
  const isTransient = (
    (code && TRANSIENT_ERROR_CODES.has(code)) ||
    (status && TRANSIENT_HTTP_STATUS.has(status))
  );

  return {
    code,
    status,
    isTransient,
    type: isTransient ? "transient" : "permanent"
  };
}

function shouldRetryError(error) {
  return classifyNetworkError(error).isTransient;
}

function getRetryDelayMs(attemptIndex, baseDelayMs = RETRY_BASE_DELAY_MS) {
  const base = Math.max(100, Number(baseDelayMs) || RETRY_BASE_DELAY_MS);
  const exponential = base * (2 ** Math.max(0, attemptIndex - 1));
  const jitter = Math.floor(Math.random() * Math.max(50, base / 2));
  return exponential + jitter;
}

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function withRetry(task, options = {}) {
  const attempts = Math.max(1, Number(options.attempts) || 1);
  const baseDelayMs = options.baseDelayMs;
  const retryOn = typeof options.retryOn === "function" ? options.retryOn : shouldRetryError;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task({ attempt, attempts });
    } catch (error) {
      lastError = error;
      const canRetry = attempt < attempts && retryOn(error);
      if (!canRetry) {
        break;
      }

      const delayMs = getRetryDelayMs(attempt, baseDelayMs);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

module.exports = {
  classifyNetworkError,
  getHttpStatus,
  shouldRetryError,
  withRetry
};
