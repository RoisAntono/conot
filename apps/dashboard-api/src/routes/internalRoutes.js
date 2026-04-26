"use strict";

const { ERROR_CODES, fail, ok } = require("@conot/shared-types");
const { sendJson } = require("../lib/http");

function getBearerToken(req) {
  const auth = String(req.headers.authorization || "");
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return auth.slice(7).trim();
}

function registerInternalRoutes(router, appContext) {
  router.add("GET", "/v1/internal/config/export", async (req, res, routeContext) => {
    const token = getBearerToken(req);
    if (!appContext.env.configServiceToken || token !== appContext.env.configServiceToken) {
      sendJson(
        res,
        401,
        fail(ERROR_CODES.UNAUTHORIZED, "Unauthorized internal config export.", null, req.traceId)
      );
      return;
    }

    const data = await appContext.repository.read();
    const guildId = String(routeContext.query.get("guildId") || "").trim();

    if (guildId) {
      const filtered = {
        ...data,
        guildSettings: (data.guildSettings || []).filter((item) => item?.guildId === guildId),
        trackedChannels: (data.trackedChannels || []).filter((item) => item?.discord?.guildId === guildId)
      };
      sendJson(
        res,
        200,
        ok(filtered, {
          scoped: true,
          guildId
        })
      );
      return;
    }

    sendJson(
      res,
      200,
      ok(data, {
        scoped: false
      })
    );
  });

  router.add("GET", "/v1/internal/events/next", async (req, res, routeContext) => {
    const token = getBearerToken(req);
    if (!appContext.env.configServiceToken || token !== appContext.env.configServiceToken) {
      sendJson(
        res,
        401,
        fail(ERROR_CODES.UNAUTHORIZED, "Unauthorized internal event stream.", null, req.traceId)
      );
      return;
    }

    const afterSeq = Number(routeContext.query.get("afterSeq") || 0);
    const timeoutMs = Number(routeContext.query.get("timeoutMs") || 25_000);
    const event = await appContext.eventBus.waitForNextEvent(
      Number.isFinite(afterSeq) ? afterSeq : 0,
      timeoutMs
    );

    sendJson(
      res,
      200,
      ok(
        {
          event
        },
        {
          timeout: !event,
          latestSeq: appContext.eventBus.getLatestSequence()
        }
      )
    );
  });
}

module.exports = {
  registerInternalRoutes
};
