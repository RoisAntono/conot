"use strict";

const { ok, ERROR_CODES, fail } = require("@conot/shared-types");
const { requireSession } = require("../middlewares/authGuard");
const { hasManageGuildAccess, requireGuildAccess } = require("../middlewares/rbacGuard");
const { sendJson } = require("../lib/http");

function registerGuildRoutes(router, appContext) {
  router.add("GET", "/v1/guilds", async (req, res) => {
    const sessionContext = await requireSession(req, res, appContext);
    if (!sessionContext) {
      return;
    }

    const botGuildInfo = await appContext.discordService.getBotGuildInfo();
    const botGuildIds = botGuildInfo.ids;
    const enforceJoinFilter = Boolean(botGuildInfo.enforceJoinFilter && botGuildIds);
    const guilds = sessionContext.session.guilds
      .map((guild) => {
        const canManage = hasManageGuildAccess(guild);
        const botJoined = botGuildIds ? botGuildIds.has(guild.id) : true;
        const botGuild = botGuildInfo.guildMap?.get(guild.id) || null;
        return {
          id: guild.id,
          name: guild.name || botGuild?.name || `Guild ${String(guild.id).slice(-4)}`,
          icon: guild.icon || null,
          botIcon: botGuild?.icon || null,
          canManage,
          botJoined,
          botJoinSource: botGuildInfo.source
        };
      })
      .filter((guild) => guild.canManage && (!enforceJoinFilter || guild.botJoined));

    sendJson(
      res,
      200,
      ok(guilds, {
        total: guilds.length,
        botGuildFilter: enforceJoinFilter ? "enabled" : "degraded",
        botGuildSource: botGuildInfo.source
      })
    );
  });

  router.add("GET", "/v1/guilds/:guildId/permissions", async (req, res, routeContext) => {
    const sessionContext = await requireSession(req, res, appContext);
    if (!sessionContext) {
      return;
    }
    const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
    if (!guild) {
      return;
    }

    const botGuildInfo = await appContext.discordService.getBotGuildInfo();
    const botJoined = botGuildInfo.ids ? botGuildInfo.ids.has(guild.id) : null;

    sendJson(
      res,
      200,
      ok({
        guildId: guild.id,
        hasAccess: true,
        hasManageGuild: hasManageGuildAccess(guild),
        botJoined,
        botGuildSource: botGuildInfo.source
      })
    );
  });

  router.add("GET", "/v1/guilds/:guildId/discord/channels", async (req, res, routeContext) => {
    const sessionContext = await requireSession(req, res, appContext);
    if (!sessionContext) {
      return;
    }

    const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
    if (!guild) {
      return;
    }

    const channels = await appContext.discordService.getBotTextChannels(routeContext.params.guildId);
    sendJson(
      res,
      200,
      ok({
        guildId: routeContext.params.guildId,
        channels
      })
    );
  });

  router.add("GET", "/v1/guilds/:guildId/discord/roles", async (req, res, routeContext) => {
    const sessionContext = await requireSession(req, res, appContext);
    if (!sessionContext) {
      return;
    }

    const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
    if (!guild) {
      return;
    }

    const roles = await appContext.discordService.getBotRoles(routeContext.params.guildId);
    sendJson(
      res,
      200,
      ok({
        guildId: routeContext.params.guildId,
        roles
      })
    );
  });

  router.add("GET", "/v1/owner/flags", async (req, res) => {
    const sessionContext = await requireSession(req, res, appContext);
    if (!sessionContext) {
      return;
    }

    const userId = sessionContext.session.user.id;
    const isOwner = appContext.env.ownerUserIds.includes(userId);
    if (!isOwner) {
      sendJson(
        res,
        403,
        fail(ERROR_CODES.FORBIDDEN_PERMISSION, "Akses owner saja.", null, req.traceId)
      );
      return;
    }

    sendJson(res, 200, ok({ isOwner, featureFlags: appContext.featureFlags }));
  });
}

module.exports = {
  registerGuildRoutes
};
