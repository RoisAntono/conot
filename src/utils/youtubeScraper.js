const axios = require("axios");
const {
  DEFAULT_HEADERS,
  HTTP_RETRY_ATTEMPTS
} = require("../config/constants");
const { decodeHtmlEntities } = require("./htmlEntities");
const { withRetry } = require("./networkRetry");
const { buildChannelUrl, buildHandleUrl } = require("./youtubeUrl");

function looksLikeChannelId(value) {
  return /^UC[a-zA-Z0-9_-]{22}$/.test(String(value || "").trim());
}

function safeParseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeYouTubeInput(input) {
  const raw = String(input || "").trim();
  if (!raw) {
    throw new Error("Username YouTube tidak boleh kosong.");
  }

  if (looksLikeChannelId(raw)) {
    return raw;
  }

  const parsedUrl = safeParseUrl(raw);
  if (parsedUrl) {
    const segments = parsedUrl.pathname.split("/").filter(Boolean);

    if (segments[0]?.startsWith("@")) {
      return segments[0].toLowerCase();
    }

    if (segments[0] === "channel" && looksLikeChannelId(segments[1])) {
      return segments[1];
    }
  }

  const sanitized = raw.replace(/^@+/, "").replace(/^\/+|\/+$/g, "");
  if (!sanitized) {
    throw new Error("Format username YouTube tidak valid.");
  }

  return `@${sanitized.toLowerCase()}`;
}

function extractChannelId(html) {
  const patterns = [
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})"/i,
    /<meta itemprop="channelId" content="(UC[a-zA-Z0-9_-]{22})">/i,
    /"externalId":"(UC[a-zA-Z0-9_-]{22})"/,
    /"ownerProfileUrl":"https:\\\/\\\/www\.youtube\.com\\\/channel\\\/(UC[a-zA-Z0-9_-]{22})"/,
    /"channelId":"(UC[a-zA-Z0-9_-]{22})"/
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function extractChannelTitle(html) {
  const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)">/i);
  if (ogTitleMatch?.[1]) {
    return decodeHtmlEntities(ogTitleMatch[1]).trim();
  }

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) {
    return decodeHtmlEntities(titleMatch[1]).replace(/\s*-\s*YouTube\s*$/i, "").trim();
  }

  return null;
}

async function scrapeYouTubeChannel(input) {
  const normalizedInput = normalizeYouTubeInput(input);

  if (looksLikeChannelId(normalizedInput)) {
    return {
      channelId: normalizedInput,
      username: normalizedInput,
      title: null,
      resolvedUrl: buildChannelUrl(normalizedInput)
    };
  }

  const targetUrl = buildHandleUrl(normalizedInput);
  const response = await withRetry(
    () => axios.get(targetUrl, {
      headers: DEFAULT_HEADERS,
      timeout: 15000,
      maxRedirects: 5
    }),
    { attempts: HTTP_RETRY_ATTEMPTS }
  );

  const html = response.data;
  const channelId = extractChannelId(html);

  if (!channelId) {
    throw new Error(`Gagal menemukan channelId dari halaman ${normalizedInput}.`);
  }

  return {
    channelId,
    username: normalizedInput,
    title: extractChannelTitle(html),
    resolvedUrl: targetUrl
  };
}

module.exports = {
  looksLikeChannelId,
  normalizeYouTubeInput,
  scrapeYouTubeChannel
};
