"use strict";

const DISCORD_OAUTH_BASE = "https://discord.com/api/oauth2/authorize";
const DISCORD_API_BASE = "https://discord.com/api/v10";

function buildDiscordLoginUrl(config, state) {
  const query = new URLSearchParams({
    client_id: config.discordClientId || "",
    redirect_uri: config.discordRedirectUri,
    response_type: "code",
    scope: "identify guilds",
    state
  });

  return `${DISCORD_OAUTH_BASE}?${query.toString()}`;
}

function parseMockCallbackPayload(query) {
  const userId = String(query.get("user_id") || "").trim();
  const username = String(query.get("username") || "mock-user").trim();
  const guildIds = String(query.get("guild_ids") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const adminGuildIds = String(query.get("admin_guild_ids") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!userId) {
    throw new Error("mock callback membutuhkan query user_id.");
  }

  return {
    user: {
      id: userId,
      username,
      handle: `@${username.toLowerCase().replace(/\s+/g, "")}`,
      avatar: null,
      discriminator: "0"
    },
    guilds: guildIds.map((guildId) => ({
      id: guildId,
      name: `Guild ${guildId.slice(-4)}`,
      icon: null,
      owner: false,
      permissions: adminGuildIds.includes(guildId) ? "8" : "0",
      permissionsNew: adminGuildIds.includes(guildId) ? "8" : "0"
    }))
  };
}

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Discord request timeout.")), timeoutMs);
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeout);
    }
  };
}

async function requestDiscordJson(url, { method = "GET", headers = {}, body, timeoutMs = 12_000 } = {}) {
  const timer = createTimeoutSignal(timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: timer.signal
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error_description || payload?.message || "Discord API request gagal.");
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } finally {
    timer.clear();
  }
}

async function exchangeOAuthCode(config, code) {
  const form = new URLSearchParams({
    client_id: config.discordClientId,
    client_secret: config.discordClientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.discordRedirectUri
  });

  return requestDiscordJson(`${DISCORD_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: form.toString(),
    timeoutMs: config.discordApiTimeoutMs
  });
}

async function fetchDiscordUser(accessToken, config) {
  return requestDiscordJson(`${DISCORD_API_BASE}/users/@me`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    timeoutMs: config.discordApiTimeoutMs
  });
}

async function fetchDiscordUserGuilds(accessToken, config) {
  return requestDiscordJson(`${DISCORD_API_BASE}/users/@me/guilds`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    timeoutMs: config.discordApiTimeoutMs
  });
}

async function fetchDiscordBotGuilds(botToken, config) {
  if (!botToken) {
    return [];
  }

  return requestDiscordJson(`${DISCORD_API_BASE}/users/@me/guilds`, {
    headers: {
      authorization: `Bot ${botToken}`
    },
    timeoutMs: config.discordApiTimeoutMs
  });
}

async function fetchDiscordGuildChannels(botToken, guildId, config) {
  if (!botToken || !guildId) {
    return [];
  }

  return requestDiscordJson(`${DISCORD_API_BASE}/guilds/${encodeURIComponent(guildId)}/channels`, {
    headers: {
      authorization: `Bot ${botToken}`
    },
    timeoutMs: config.discordApiTimeoutMs
  });
}

async function fetchDiscordGuildRoles(botToken, guildId, config) {
  if (!botToken || !guildId) {
    return [];
  }

  return requestDiscordJson(`${DISCORD_API_BASE}/guilds/${encodeURIComponent(guildId)}/roles`, {
    headers: {
      authorization: `Bot ${botToken}`
    },
    timeoutMs: config.discordApiTimeoutMs
  });
}

async function resolveDiscordOAuthProfile(config, code) {
  const tokenPayload = await exchangeOAuthCode(config, code);
  const accessToken = tokenPayload.access_token;
  const [user, guildsRaw] = await Promise.all([
    fetchDiscordUser(accessToken, config),
    fetchDiscordUserGuilds(accessToken, config)
  ]);

  return {
    user: {
      id: String(user.id),
      username: user.global_name || user.username || "discord-user",
      handle: user.username ? `@${user.username}` : null,
      avatar: user.avatar || null,
      discriminator: String(user.discriminator || "0")
    },
    guilds: (guildsRaw || []).map((guild) => ({
      id: String(guild.id),
      name: guild.name || `Guild ${String(guild.id).slice(-4)}`,
      icon: guild.icon || null,
      owner: Boolean(guild.owner),
      permissions: String(guild.permissions || "0"),
      permissionsNew: String(guild.permissions_new || guild.permissions || "0")
    })),
    oauth: {
      scope: tokenPayload.scope || "",
      tokenType: tokenPayload.token_type || "Bearer",
      expiresIn: tokenPayload.expires_in || 0
    }
  };
}

module.exports = {
  buildDiscordLoginUrl,
  fetchDiscordBotGuilds,
  fetchDiscordGuildChannels,
  fetchDiscordGuildRoles,
  parseMockCallbackPayload,
  resolveDiscordOAuthProfile
};
