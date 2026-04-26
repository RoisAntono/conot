"use strict";

const { randomUUID } = require("node:crypto");
const { ok, fail, ERROR_CODES } = require("@conot/shared-types");
const { buildDiscordLoginUrl, parseMockCallbackPayload } = require("../auth/discordAuth");
const { requireSession } = require("../middlewares/authGuard");
const { sendJson, setCookie } = require("../lib/http");

function resolveReturnTo(rawValue, appContext) {
  const fallback = appContext.env.defaultReturnTo;
  if (!rawValue) {
    return fallback;
  }

  try {
    const parsed = new URL(rawValue);
    const allowedOrigins = new Set([appContext.env.webOrigin, appContext.env.baseUrl]);
    if (!allowedOrigins.has(parsed.origin)) {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function buildMockCallbackUrl(state, appContext) {
  const query = new URLSearchParams({
    state,
    user_id: appContext.env.mockUserId,
    username: appContext.env.mockUsername,
    guild_ids: appContext.env.mockGuildIds.join(","),
    admin_guild_ids: appContext.env.mockAdminGuildIds.join(",")
  });

  return `${appContext.env.baseUrl}/v1/auth/discord/callback?${query.toString()}`;
}

function registerAuthRoutes(router, appContext) {
  router.add("GET", "/v1/auth/discord/login", async (_req, res, routeContext) => {
    if (
      appContext.env.authMode !== "mock" &&
      (!appContext.env.discordClientId || !appContext.env.discordClientSecret)
    ) {
      sendJson(
        res,
        500,
        fail(
          ERROR_CODES.INTERNAL_ERROR,
          "DISCORD_CLIENT_ID atau DISCORD_CLIENT_SECRET belum di-set.",
          null,
          _req.traceId
        )
      );
      return;
    }

    const returnTo = resolveReturnTo(routeContext.query.get("return_to"), appContext);
    const state = await appContext.sessionStore.createStateToken({
      issuedAt: Date.now(),
      returnTo
    });
    const loginUrl = buildDiscordLoginUrl(appContext.env, state);

    const wantsRedirect = ["1", "true", "yes"].includes(
      String(routeContext.query.get("redirect") || "").toLowerCase()
    );

    if (wantsRedirect) {
      if (appContext.env.authMode === "mock" && appContext.env.allowMockAutoLogin) {
        res.writeHead(302, { location: buildMockCallbackUrl(state, appContext) });
        res.end();
        return;
      }

      res.writeHead(302, { location: loginUrl });
      res.end();
      return;
    }

    sendJson(res, 200, ok({ loginUrl, authMode: appContext.env.authMode, returnTo }));
  });

  router.add("GET", "/v1/auth/discord/callback", async (req, res, routeContext) => {
    if (routeContext.query.get("error")) {
      sendJson(
        res,
        400,
        fail(
          ERROR_CODES.UNAUTHORIZED,
          `Discord OAuth error: ${routeContext.query.get("error_description") || routeContext.query.get("error")}`,
          null,
          req.traceId
        )
      );
      return;
    }

    const state = routeContext.query.get("state");
    const stateContext = state ? await appContext.sessionStore.consumeStateToken(state) : null;
    if (!state || !stateContext) {
      sendJson(
        res,
        400,
        fail(ERROR_CODES.UNAUTHORIZED, "State OAuth tidak valid atau kadaluarsa.", null, req.traceId)
      );
      return;
    }

    try {
      if (appContext.env.authMode !== "mock" && !routeContext.query.get("code")) {
        sendJson(
          res,
          400,
          fail(ERROR_CODES.VALIDATION_ERROR, "Parameter code OAuth tidak ditemukan.", null, req.traceId)
        );
        return;
      }

      const profile =
        appContext.env.authMode === "mock"
          ? parseMockCallbackPayload(routeContext.query)
          : await appContext.discordService.resolveOAuthProfile(routeContext.query.get("code"));

      const botGuildInfo = await appContext.discordService.getBotGuildInfo();
      const guilds = profile.guilds;

      const sessionId = await appContext.sessionStore.createSession({
        user: profile.user,
        guilds,
        csrfToken: randomUUID(),
        authMode: appContext.env.authMode,
        botGuildSource: botGuildInfo.source,
        signedInAt: new Date().toISOString()
      });
      setCookie(res, appContext.env.sessionCookieName, sessionId, {
        maxAge: Math.floor(appContext.env.sessionTtlMs / 1000),
        secure: appContext.env.nodeEnv === "production"
      });

      if (stateContext.returnTo) {
        res.writeHead(302, { location: stateContext.returnTo });
        res.end();
        return;
      }

      sendJson(
        res,
        200,
        ok({
          user: profile.user,
          guilds,
          mode: appContext.env.authMode,
          botGuildSource: botGuildInfo.source,
          csrfToken: (await appContext.sessionStore.getSession(sessionId))?.csrfToken
        })
      );
    } catch (error) {
      sendJson(res, 400, fail(ERROR_CODES.VALIDATION_ERROR, error.message, null, req.traceId));
    }
  });

  router.add("POST", "/v1/auth/logout", async (req, res) => {
    const sessionContext = await requireSession(req, res, appContext);
    if (!sessionContext) {
      return;
    }
    await appContext.sessionStore.destroySession(sessionContext.sessionId);
    setCookie(res, appContext.env.sessionCookieName, "", {
      maxAge: 0,
      secure: appContext.env.nodeEnv === "production"
    });
    sendJson(res, 200, ok({ loggedOut: true }));
  });

  router.add("GET", "/v1/auth/me", async (req, res) => {
    const sessionContext = await requireSession(req, res, appContext);
    if (!sessionContext) {
      return;
    }
    sendJson(res, 200, ok(sessionContext.session));
  });
}

module.exports = {
  registerAuthRoutes
};
