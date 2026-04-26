"use strict";

const ADMINISTRATOR_PERMISSION = 0x8n;
const MANAGE_GUILD_PERMISSION = 0x20n;

function hasManageGuildPermission(permissionBits) {
  if (permissionBits == null) {
    return false;
  }

  try {
    const bits = BigInt(permissionBits);
    const hasAdmin = (bits & ADMINISTRATOR_PERMISSION) === ADMINISTRATOR_PERMISSION;
    const hasManageGuild = (bits & MANAGE_GUILD_PERMISSION) === MANAGE_GUILD_PERMISSION;
    return hasAdmin || hasManageGuild;
  } catch {
    return false;
  }
}

module.exports = {
  ADMINISTRATOR_PERMISSION,
  MANAGE_GUILD_PERMISSION,
  hasManageGuildPermission
};
