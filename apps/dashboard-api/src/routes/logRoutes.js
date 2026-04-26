"use strict";

const { requireSession } = require("../middlewares/authGuard");
const { requireGuildAccess } = require("../middlewares/rbacGuard");
const { sendAttachment, sendInternalError, sendOk } = require("../lib/handlers");

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function toCsv(rows = []) {
  return rows
    .map((row) => row.map((cell) => csvEscape(cell)).join(","))
    .join("\n");
}

function buildLogQuery(query) {
  const level = query.get("level") || undefined;
  const scope = query.get("scope") || undefined;
  const q = query.get("q") || undefined;
  const from = query.get("from") || undefined;
  const to = query.get("to") || undefined;
  const limitRaw = Number(query.get("limit"));
  const limit = Number.isInteger(limitRaw) ? limitRaw : undefined;
  return {
    level,
    scope,
    q,
    from,
    to,
    limit
  };
}

function registerLogRoutes(router, appContext) {
  router.add("GET", "/v1/guilds/:guildId/logs", async (req, res, routeContext) => {
    try {
      const sessionContext = await requireSession(req, res, appContext);
      if (!sessionContext) return;
      const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
      if (!guild) return;

      const logs = await appContext.configService.listGuildLogs(
        routeContext.params.guildId,
        buildLogQuery(routeContext.query)
      );

      sendOk(res, logs);
    } catch (error) {
      sendInternalError(req, res, error);
    }
  });

  router.add("GET", "/v1/guilds/:guildId/logs/export", async (req, res, routeContext) => {
    try {
      const sessionContext = await requireSession(req, res, appContext);
      if (!sessionContext) return;
      const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
      if (!guild) return;

      const format = String(routeContext.query.get("format") || "csv").trim().toLowerCase();
      const logs = await appContext.configService.listGuildLogs(
        routeContext.params.guildId,
        buildLogQuery(routeContext.query)
      );
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");

      if (format === "json") {
        sendAttachment(res, {
          contentType: "application/json; charset=utf-8",
          filename: `conot-logs-${routeContext.params.guildId}-${stamp}.json`,
          content: JSON.stringify(logs, null, 2)
        });
        return;
      }

      const rows = [
        ["createdAt", "level", "scope", "message", "meta"]
      ];
      for (const item of logs) {
        rows.push([
          item?.createdAt || "",
          item?.level || "",
          item?.scope || "",
          item?.message || "",
          item?.meta ? JSON.stringify(item.meta) : ""
        ]);
      }

      sendAttachment(res, {
        contentType: "text/csv; charset=utf-8",
        filename: `conot-logs-${routeContext.params.guildId}-${stamp}.csv`,
        content: toCsv(rows)
      });
    } catch (error) {
      sendInternalError(req, res, error);
    }
  });
}

module.exports = {
  registerLogRoutes
};
