const { sendUserLog } = require("./botLogService");

function toInlineValue(value, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

function buildActorLabel(actor) {
  if (!actor) {
    return "Unknown";
  }

  const username = actor.tag || actor.username || actor.id || "Unknown";
  return actor.id ? `${username} (\`${actor.id}\`)` : username;
}

function buildActionSignature(action, keyParts = []) {
  const suffix = keyParts
    .map((part) => String(part || "").trim().toLowerCase())
    .filter(Boolean)
    .join(":");
  return suffix ? `action:${action}:${suffix}` : `action:${action}`;
}

async function logGuildAction(client, {
  guildId,
  actor,
  action,
  description,
  details = [],
  keyParts = []
}) {
  if (!guildId || !action) {
    return false;
  }

  const actorField = {
    name: "Admin",
    value: toInlineValue(buildActorLabel(actor)),
    inline: false
  };

  return sendUserLog(client, {
    guildId,
    level: "info",
    scope: "Audit",
    title: action,
    description: description || "Konfigurasi server diperbarui.",
    logSignature: buildActionSignature(action, keyParts),
    details: [actorField, ...details]
  });
}

module.exports = {
  logGuildAction
};
