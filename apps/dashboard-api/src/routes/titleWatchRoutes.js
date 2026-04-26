"use strict";

const { validateTitleWatchCreate, validateTitleWatchPatch } = require("@conot/shared-schema");
const { requireSession } = require("../middlewares/authGuard");
const { enforceRateLimit } = require("../middlewares/rateLimitGuard");
const { requireGuildAccess, requireManageGuild } = require("../middlewares/rbacGuard");
const {
  readBodyOrError,
  sendCreated,
  sendInternalError,
  sendNotFound,
  sendOk,
  sendValidationError
} = require("../lib/handlers");

function registerTitleWatchRoutes(router, appContext) {
  router.add("GET", "/v1/guilds/:guildId/title-watches", async (req, res, routeContext) => {
    try {
      const sessionContext = await requireSession(req, res, appContext);
      if (!sessionContext) return;
      const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
      if (!guild) return;

      const watches = await appContext.configService.listTitleWatches(routeContext.params.guildId);
      sendOk(res, watches);
    } catch (error) {
      sendInternalError(req, res, error);
    }
  });

  router.add("POST", "/v1/guilds/:guildId/title-watches", async (req, res, routeContext) => {
    try {
      const sessionContext = await requireSession(req, res, appContext);
      if (!sessionContext) return;
      const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
      if (!guild || !requireManageGuild(req, res, guild)) return;
      if (
        !enforceRateLimit(req, res, appContext, {
          scope: "title-watch:create",
          guildId: routeContext.params.guildId,
          userId: sessionContext.session.user.id,
          windowMs: appContext.env.mutationRateWindowMs,
          maxRequests: appContext.env.mutationRateMaxRequests,
          message: "Terlalu banyak request create title watch. Coba lagi beberapa detik."
        })
      ) {
        return;
      }

      const body = await readBodyOrError(req, res);
      if (!body) return;
      const valid = validateTitleWatchCreate(body);
      if (!valid.ok) {
        sendValidationError(req, res, valid.errors);
        return;
      }

      const created = await appContext.configService.createTitleWatch(
        routeContext.params.guildId,
        valid.data,
        sessionContext.session.user.id
      );
      sendCreated(res, created);
    } catch (error) {
      sendInternalError(req, res, error);
    }
  });

  router.add(
    "PATCH",
    "/v1/guilds/:guildId/title-watches/:watchId",
    async (req, res, routeContext) => {
      try {
        const sessionContext = await requireSession(req, res, appContext);
        if (!sessionContext) return;
        const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
        if (!guild || !requireManageGuild(req, res, guild)) return;
        if (
          !enforceRateLimit(req, res, appContext, {
            scope: "title-watch:update",
            guildId: routeContext.params.guildId,
            userId: sessionContext.session.user.id,
            windowMs: appContext.env.mutationRateWindowMs,
            maxRequests: appContext.env.mutationRateMaxRequests,
            message: "Terlalu banyak request update title watch. Coba lagi beberapa detik."
          })
        ) {
          return;
        }

        const body = await readBodyOrError(req, res);
        if (!body) return;
        const valid = validateTitleWatchPatch(body);
        if (!valid.ok) {
          sendValidationError(req, res, valid.errors);
          return;
        }

        const updated = await appContext.configService.updateTitleWatch(
          routeContext.params.guildId,
          routeContext.params.watchId,
          valid.data,
          sessionContext.session.user.id
        );

        if (!updated) {
          sendNotFound(req, res, "Title watch tidak ditemukan.");
          return;
        }
        sendOk(res, updated);
      } catch (error) {
        sendInternalError(req, res, error);
      }
    }
  );

  router.add(
    "DELETE",
    "/v1/guilds/:guildId/title-watches/:watchId",
    async (req, res, routeContext) => {
      try {
        const sessionContext = await requireSession(req, res, appContext);
        if (!sessionContext) return;
        const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
        if (!guild || !requireManageGuild(req, res, guild)) return;
        if (
          !enforceRateLimit(req, res, appContext, {
            scope: "title-watch:delete",
            guildId: routeContext.params.guildId,
            userId: sessionContext.session.user.id,
            windowMs: appContext.env.mutationRateWindowMs,
            maxRequests: appContext.env.mutationRateMaxRequests,
            message: "Terlalu banyak request delete title watch. Coba lagi beberapa detik."
          })
        ) {
          return;
        }

        const deleted = await appContext.configService.deleteTitleWatch(
          routeContext.params.guildId,
          routeContext.params.watchId,
          sessionContext.session.user.id
        );
        if (!deleted) {
          sendNotFound(req, res, "Title watch tidak ditemukan.");
          return;
        }
        sendOk(res, { deleted: true });
      } catch (error) {
        sendInternalError(req, res, error);
      }
    }
  );
}

module.exports = {
  registerTitleWatchRoutes
};
