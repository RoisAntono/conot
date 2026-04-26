"use strict";

const { requireSession } = require("../middlewares/authGuard");
const { enforceRateLimit } = require("../middlewares/rateLimitGuard");
const { requireGuildAccess, requireManageGuild } = require("../middlewares/rbacGuard");
const { readBodyOrError, sendInternalError, sendOk } = require("../lib/handlers");

function registerPreviewRoutes(router, appContext) {
  router.add("POST", "/v1/guilds/:guildId/preview/send-test", async (req, res, routeContext) => {
    try {
      const sessionContext = await requireSession(req, res, appContext);
      if (!sessionContext) return;

      const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
      if (!guild || !requireManageGuild(req, res, guild)) return;

      if (
        !enforceRateLimit(req, res, appContext, {
          scope: "preview",
          guildId: routeContext.params.guildId,
          userId: sessionContext.session.user.id,
          windowMs: appContext.env.previewRateWindowMs,
          maxRequests: appContext.env.previewRateMaxRequests,
          message: "Terlalu banyak test preview. Coba lagi beberapa detik."
        })
      ) {
        return;
      }

      const body = await readBodyOrError(req, res);
      if (!body) return;

      await appContext.configService.appendGuildLog(routeContext.params.guildId, {
        level: "warn",
        scope: "preview",
        message: "Test preview dipicu dari dashboard.",
        meta: {
          actorUserId: sessionContext.session.user.id,
          trackerId: body.trackerId || null
        }
      });

      sendOk(res, {
        accepted: true,
        mode: "simulated",
        note: "Endpoint ini hanya simulasi untuk fase MVP awal."
      });
    } catch (error) {
      sendInternalError(req, res, error);
    }
  });
}

module.exports = {
  registerPreviewRoutes
};
