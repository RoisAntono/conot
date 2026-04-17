async function resolveGuildChannel(guild, rawValue) {
  if (!rawValue) {
    return null;
  }

  const id = String(rawValue).replace(/[<#>]/g, "");
  if (!/^\d+$/.test(id)) {
    return null;
  }

  return guild.channels.cache.get(id) || guild.channels.fetch(id).catch(() => null);
}

async function resolveGuildRole(guild, rawValue) {
  if (!rawValue) {
    return null;
  }

  const id = String(rawValue).replace(/[<@&>]/g, "");
  if (!/^\d+$/.test(id)) {
    return null;
  }

  return guild.roles.cache.get(id) || guild.roles.fetch(id).catch(() => null);
}

async function resolveGuildUser(guild, rawValue) {
  if (!rawValue) {
    return null;
  }

  const id = String(rawValue).replace(/[<@!>]/g, "");
  if (!/^\d+$/.test(id)) {
    return null;
  }

  return guild.members.cache.get(id)?.user || guild.client.users.fetch(id).catch(() => null);
}

module.exports = {
  resolveGuildChannel,
  resolveGuildRole,
  resolveGuildUser
};
