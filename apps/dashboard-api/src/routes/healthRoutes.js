"use strict";

const { requireSession } = require("../middlewares/authGuard");
const { requireGuildAccess } = require("../middlewares/rbacGuard");
const { buildHealthSnapshot } = require("../services/healthService");
const { sendInternalError, sendOk } = require("../lib/handlers");

function registerHealthRoutes(router, appContext) {
  router.add("GET", "/v1/guilds/:guildId/health", async (req, res, routeContext) => {
    try {
      const sessionContext = await requireSession(req, res, appContext);
      if (!sessionContext) return;
      const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
      if (!guild) return;

      const health = await buildHealthSnapshot({
        repository: appContext.repository,
        guildId: routeContext.params.guildId,
        startedAt: appContext.startedAt
      });

      sendOk(res, health);
    } catch (error) {
      sendInternalError(req, res, error);
    }
  });
}

module.exports = {
  registerHealthRoutes
};
