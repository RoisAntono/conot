"use strict";

const { ERROR_CODES, fail, hasManageGuildPermission } = require("@conot/shared-types");
const { sendJson } = require("../lib/http");

function hasManageGuildAccess(guild) {
  if (!guild) {
    return false;
  }

  if (guild.owner) {
    return true;
  }

  return hasManageGuildPermission(guild.permissionsNew || guild.permissions);
}

function requireGuildAccess(req, res, guildId, sessionContext) {
  const guild = sessionContext.session.guilds.find((item) => item.id === guildId);
  if (!guild) {
    sendJson(
      res,
      403,
      fail(ERROR_CODES.FORBIDDEN_GUILD, "Anda tidak punya akses ke guild ini.", null, req.traceId)
    );
    return null;
  }
  return guild;
}

function requireManageGuild(req, res, guild) {
  if (!hasManageGuildAccess(guild)) {
    sendJson(
      res,
      403,
      fail(
        ERROR_CODES.FORBIDDEN_PERMISSION,
        "Dibutuhkan permission MANAGE_GUILD untuk mutasi konfigurasi.",
        null,
        req.traceId
      )
    );
    return false;
  }
  return true;
}

module.exports = {
  hasManageGuildAccess,
  requireGuildAccess,
  requireManageGuild
};
