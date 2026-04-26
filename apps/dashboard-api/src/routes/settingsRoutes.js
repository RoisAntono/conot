"use strict";

const { validateSettingsPatch } = require("@conot/shared-schema");
const { requireSession } = require("../middlewares/authGuard");
const { enforceRateLimit } = require("../middlewares/rateLimitGuard");
const { requireGuildAccess, requireManageGuild } = require("../middlewares/rbacGuard");
const {
  readBodyOrError,
  sendInternalError,
  sendOk,
  sendValidationError
} = require("../lib/handlers");

function registerSettingsRoutes(router, appContext) {
  router.add("GET", "/v1/guilds/:guildId/settings", async (req, res, routeContext) => {
    try {
      const sessionContext = await requireSession(req, res, appContext);
      if (!sessionContext) return;
      const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
      if (!guild) return;

      const settings = await appContext.configService.getGuildSettings(routeContext.params.guildId);
      sendOk(res, settings || null);
    } catch (error) {
      sendInternalError(req, res, error);
    }
  });

  router.add("PATCH", "/v1/guilds/:guildId/settings", async (req, res, routeContext) => {
    try {
      const sessionContext = await requireSession(req, res, appContext);
      if (!sessionContext) return;
      const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
      if (!guild || !requireManageGuild(req, res, guild)) return;
      if (
        !enforceRateLimit(req, res, appContext, {
          scope: "settings:update",
          guildId: routeContext.params.guildId,
          userId: sessionContext.session.user.id,
          windowMs: appContext.env.mutationRateWindowMs,
          maxRequests: appContext.env.mutationRateMaxRequests,
          message: "Terlalu banyak request update settings. Coba lagi beberapa detik."
        })
      ) {
        return;
      }

      const body = await readBodyOrError(req, res);
      if (!body) return;

      const valid = validateSettingsPatch(body);
      if (!valid.ok) {
        sendValidationError(req, res, valid.errors);
        return;
      }

      const updated = await appContext.configService.patchGuildSettings(
        routeContext.params.guildId,
        valid.data,
        sessionContext.session.user.id
      );
      sendOk(res, updated);
    } catch (error) {
      sendInternalError(req, res, error);
    }
  });
}

module.exports = {
  registerSettingsRoutes
};
