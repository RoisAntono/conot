"use strict";

const { randomUUID } = require("node:crypto");

function createTraceId() {
  return randomUUID();
}

function getRequestPath(req) {
  const fullUrl = new URL(req.url || "/", "http://localhost");
  return fullUrl.pathname;
}

function parseJsonBody(req, maxSizeBytes = 1024 * 512) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > maxSizeBytes) {
        reject(new Error("Payload terlalu besar."));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Body JSON tidak valid."));
      }
    });

    req.on("error", reject);
  });
}

function parseCookieHeader(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(";").reduce((acc, pair) => {
    const [key, ...rest] = pair.split("=");
    if (!key) {
      return acc;
    }
    acc[key.trim()] = decodeURIComponent(rest.join("=").trim());
    return acc;
  }, {});
}

function setCookie(res, name, value, options = {}) {
  const cookieParts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge != null) {
    const maxAge = Math.max(0, Math.floor(options.maxAge));
    cookieParts.push(`Max-Age=${maxAge}`);
    cookieParts.push(`Expires=${new Date(Date.now() + maxAge * 1000).toUTCString()}`);
  }

  cookieParts.push(`Path=${options.path || "/"}`);
  cookieParts.push("HttpOnly");
  cookieParts.push("SameSite=Lax");

  if (options.secure) {
    cookieParts.push("Secure");
  }

  res.setHeader("Set-Cookie", cookieParts.join("; "));
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

module.exports = {
  createTraceId,
  getRequestPath,
  parseJsonBody,
  parseCookieHeader,
  sendJson,
  setCookie
};
