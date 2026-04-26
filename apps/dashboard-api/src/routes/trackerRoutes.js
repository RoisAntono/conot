"use strict";

const { validateTrackerCreate, validateTrackerPatch } = require("@conot/shared-schema");
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

function registerTrackerRoutes(router, appContext) {
  router.add("GET", "/v1/guilds/:guildId/trackers", async (req, res, routeContext) => {
    try {
      const sessionContext = await requireSession(req, res, appContext);
      if (!sessionContext) return;
      const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
      if (!guild) return;

      const trackers = await appContext.configService.listTrackers(routeContext.params.guildId);
      sendOk(res, trackers);
    } catch (error) {
      sendInternalError(req, res, error);
    }
  });

  router.add("POST", "/v1/guilds/:guildId/trackers", async (req, res, routeContext) => {
    try {
      const sessionContext = await requireSession(req, res, appContext);
      if (!sessionContext) return;
      const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
      if (!guild || !requireManageGuild(req, res, guild)) return;
      if (
        !enforceRateLimit(req, res, appContext, {
          scope: "tracker:create",
          guildId: routeContext.params.guildId,
          userId: sessionContext.session.user.id,
          windowMs: appContext.env.mutationRateWindowMs,
          maxRequests: appContext.env.mutationRateMaxRequests,
          message: "Terlalu banyak request create tracker. Coba lagi beberapa detik."
        })
      ) {
        return;
      }

      const body = await readBodyOrError(req, res);
      if (!body) return;
      const valid = validateTrackerCreate(body);
      if (!valid.ok) {
        sendValidationError(req, res, valid.errors);
        return;
      }

      const created = await appContext.configService.createTracker(
        routeContext.params.guildId,
        valid.data,
        sessionContext.session.user.id
      );

      await appContext.configService.appendGuildLog(routeContext.params.guildId, {
        level: "warn",
        scope: "tracker",
        message: "Tracker baru dibuat dari dashboard.",
        meta: { trackerId: created.id, actorUserId: sessionContext.session.user.id }
      });

      sendCreated(res, created);
    } catch (error) {
      sendInternalError(req, res, error);
    }
  });

  router.add("PATCH", "/v1/guilds/:guildId/trackers/:trackerId", async (req, res, routeContext) => {
    try {
      const sessionContext = await requireSession(req, res, appContext);
      if (!sessionContext) return;
      const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
      if (!guild || !requireManageGuild(req, res, guild)) return;
      if (
        !enforceRateLimit(req, res, appContext, {
          scope: "tracker:update",
          guildId: routeContext.params.guildId,
          userId: sessionContext.session.user.id,
          windowMs: appContext.env.mutationRateWindowMs,
          maxRequests: appContext.env.mutationRateMaxRequests,
          message: "Terlalu banyak request update tracker. Coba lagi beberapa detik."
        })
      ) {
        return;
      }

      const body = await readBodyOrError(req, res);
      if (!body) return;
      const valid = validateTrackerPatch(body);
      if (!valid.ok) {
        sendValidationError(req, res, valid.errors);
        return;
      }

      const updated = await appContext.configService.updateTracker(
        routeContext.params.guildId,
        routeContext.params.trackerId,
        valid.data,
        sessionContext.session.user.id
      );
      if (!updated) {
        sendNotFound(req, res, "Tracker tidak ditemukan.");
        return;
      }
      sendOk(res, updated);
    } catch (error) {
      sendInternalError(req, res, error);
    }
  });

  router.add(
    "DELETE",
    "/v1/guilds/:guildId/trackers/:trackerId",
    async (req, res, routeContext) => {
      try {
        const sessionContext = await requireSession(req, res, appContext);
        if (!sessionContext) return;
        const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
        if (!guild || !requireManageGuild(req, res, guild)) return;
        if (
          !enforceRateLimit(req, res, appContext, {
            scope: "tracker:delete",
            guildId: routeContext.params.guildId,
            userId: sessionContext.session.user.id,
            windowMs: appContext.env.mutationRateWindowMs,
            maxRequests: appContext.env.mutationRateMaxRequests,
            message: "Terlalu banyak request delete tracker. Coba lagi beberapa detik."
          })
        ) {
          return;
        }

        const removed = await appContext.configService.deleteTracker(
          routeContext.params.guildId,
          routeContext.params.trackerId,
          sessionContext.session.user.id
        );
        if (!removed) {
          sendNotFound(req, res, "Tracker tidak ditemukan.");
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
  registerTrackerRoutes
};
