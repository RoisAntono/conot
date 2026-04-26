"use strict";

const http = require("node:http");
const { ERROR_CODES, fail } = require("@conot/shared-types");
const { loadEnv } = require("./config/env");
const { Router } = require("./lib/router");
const { createTraceId, getRequestPath, sendJson } = require("./lib/http");
const { resolveRuntimePath } = require("./lib/paths");
const { createSessionStore } = require("./auth/sessionStoreFactory");
const { createConfigRepository } = require("./repositories/repositoryFactory");
const { EventBus } = require("./events/eventBus");
const { ConfigService } = require("./services/configService");
const { DiscordService } = require("./services/discordService");
const { RateLimitService } = require("./services/rateLimitService");
const { requireSession } = require("./middlewares/authGuard");
const { registerAuthRoutes } = require("./routes/authRoutes");
const { registerAuditRoutes } = require("./routes/auditRoutes");
const { registerGuildRoutes } = require("./routes/guildRoutes");
const { registerHealthRoutes } = require("./routes/healthRoutes");
const { registerInternalRoutes } = require("./routes/internalRoutes");
const { registerLogRoutes } = require("./routes/logRoutes");
const { registerNotificationRoutes } = require("./routes/notificationRoutes");
const { registerPreviewRoutes } = require("./routes/previewRoutes");
const { registerSettingsRoutes } = require("./routes/settingsRoutes");
const { registerSystemRoutes } = require("./routes/systemRoutes");
const { registerTitleWatchRoutes } = require("./routes/titleWatchRoutes");
const { registerTrackerRoutes } = require("./routes/trackerRoutes");
const { registerYoutubeRoutes } = require("./routes/youtubeRoutes");

function resolveSessionFilePath(env) {
  return resolveRuntimePath(env.sessionFilePath, "data/dashboard-sessions.json");
}

function isWildcardHost(host) {
  return host === "0.0.0.0" || host === "::" || host === "[::]";
}

function getHostLabel(host) {
  return isWildcardHost(host) ? "localhost" : host;
}

function buildAppContext() {
  const env = loadEnv();
  const repository = createConfigRepository(env);
  const eventBus = new EventBus();
  const configService = new ConfigService({ repository, eventBus });

  return {
    env,
    repository,
    eventBus,
    configService,
    discordService: new DiscordService({
      env,
      repository
    }),
    sessionStore: createSessionStore({
      env,
      persistFilePath: resolveSessionFilePath(env)
    }),
    rateLimitService: new RateLimitService(),
    storage: typeof repository.getStorageInfo === "function" ? repository.getStorageInfo() : null,
    featureFlags: {
      enableDashboard: true,
      enableAuditTrail: true,
      enableRealtimeSync: true,
      enableTestNotification: true
    },
    startedAt: Date.now()
  };
}

function createApiServer() {
  const appContext = buildAppContext();
  const router = new Router();

  registerSystemRoutes(router, appContext);
  registerAuthRoutes(router, appContext);
  registerGuildRoutes(router, appContext);
  registerAuditRoutes(router, appContext);
  registerTrackerRoutes(router, appContext);
  registerTitleWatchRoutes(router, appContext);
  registerSettingsRoutes(router, appContext);
  registerHealthRoutes(router, appContext);
  registerLogRoutes(router, appContext);
  registerNotificationRoutes(router, appContext);
  registerPreviewRoutes(router, appContext);
  registerYoutubeRoutes(router, appContext);
  registerInternalRoutes(router, appContext);

  const server = http.createServer(async (req, res) => {
    req.traceId = createTraceId();
    res.setHeader("x-trace-id", req.traceId);
    res.setHeader("access-control-allow-origin", appContext.env.webOrigin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("access-control-allow-headers", `content-type, ${appContext.env.csrfHeaderName}`);
    res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const pathname = getRequestPath(req);
    const route = router.match(req.method || "GET", pathname);
    if (!route) {
      sendJson(
        res,
        404,
        fail(ERROR_CODES.NOT_FOUND, "Endpoint tidak ditemukan.", null, req.traceId)
      );
      return;
    }

    try {
      if (["POST", "PATCH", "DELETE", "PUT"].includes((req.method || "").toUpperCase())) {
        const bypassCsrf = pathname.startsWith("/v1/auth/discord/callback");
        if (!bypassCsrf) {
          const sessionContext = await requireSession(req, res, appContext);
          if (!sessionContext) {
            return;
          }
          const incomingCsrf = req.headers[appContext.env.csrfHeaderName];
          if (!incomingCsrf || incomingCsrf !== sessionContext.session.csrfToken) {
            sendJson(
              res,
              403,
              fail(ERROR_CODES.FORBIDDEN_PERMISSION, "CSRF token tidak valid.", null, req.traceId)
            );
            return;
          }
        }
      }

      const url = new URL(req.url || "/", "http://localhost");
      await route.handler(req, res, {
        params: route.params,
        query: url.searchParams
      });
    } catch (error) {
      sendJson(
        res,
        500,
        fail(ERROR_CODES.INTERNAL_ERROR, "Unhandled error.", { message: error.message }, req.traceId)
      );
    }
  });

  return {
    appContext,
    server,
    start() {
      const host = String(appContext.env.host || "::").trim() || "::";
      const hostLabel = getHostLabel(host);

      server.on("error", (error) => {
        if (error?.code === "EADDRINUSE") {
          console.error(`[dashboard-api] port ${appContext.env.port} sudah dipakai proses lain.`);
          return;
        }

        console.error(`[dashboard-api] gagal start: ${error?.message || error}`);
      });

      server.listen(
        {
          port: appContext.env.port,
          host,
          ipv6Only: false
        },
        () => {
          console.log(
            `[dashboard-api] ready on http://${hostLabel}:${appContext.env.port} (listen ${host}, auth=${appContext.env.authMode})`
          );
        }
      );

      if (host === "::") {
        server.on("error", (error) => {
          if (error?.code !== "EAFNOSUPPORT") {
            return;
          }

          const fallbackHost = "0.0.0.0";
          server.listen(
            {
              port: appContext.env.port,
              host: fallbackHost
            },
            () => {
              console.log(
                `[dashboard-api] IPv6 tidak tersedia, fallback ke http://localhost:${appContext.env.port} (listen ${fallbackHost}, auth=${appContext.env.authMode})`
              );
            }
          );
        });
      }
    }
  };
}

module.exports = {
  createApiServer
};
