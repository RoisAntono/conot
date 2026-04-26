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

function buildNotificationQuery(query) {
  const source = query.get("source") || undefined;
  const status = query.get("status") || undefined;
  const event = query.get("event") || undefined;
  const q = query.get("q") || undefined;
  const from = query.get("from") || undefined;
  const to = query.get("to") || undefined;
  const limitRaw = Number(query.get("limit"));
  const limit = Number.isInteger(limitRaw) ? limitRaw : undefined;
  return {
    source,
    status,
    event,
    q,
    from,
    to,
    limit
  };
}

function registerNotificationRoutes(router, appContext) {
  router.add("GET", "/v1/guilds/:guildId/notifications", async (req, res, routeContext) => {
    try {
      const sessionContext = await requireSession(req, res, appContext);
      if (!sessionContext) return;
      const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
      if (!guild) return;

      const history = await appContext.configService.listNotificationHistory(
        routeContext.params.guildId,
        buildNotificationQuery(routeContext.query)
      );

      sendOk(res, history);
    } catch (error) {
      sendInternalError(req, res, error);
    }
  });

  router.add("GET", "/v1/guilds/:guildId/notifications/export", async (req, res, routeContext) => {
    try {
      const sessionContext = await requireSession(req, res, appContext);
      if (!sessionContext) return;
      const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
      if (!guild) return;

      const format = String(routeContext.query.get("format") || "csv").trim().toLowerCase();
      const history = await appContext.configService.listNotificationHistory(
        routeContext.params.guildId,
        buildNotificationQuery(routeContext.query)
      );
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");

      if (format === "json") {
        sendAttachment(res, {
          contentType: "application/json; charset=utf-8",
          filename: `conot-notifications-${routeContext.params.guildId}-${stamp}.json`,
          content: JSON.stringify(history, null, 2)
        });
        return;
      }

      const rows = [
        ["createdAt", "source", "status", "event", "keyword", "youtubeChannelTitle", "title", "videoId", "contentType", "discordChannelId", "link"]
      ];
      for (const item of history) {
        rows.push([
          item?.createdAt || "",
          item?.source || "",
          item?.status || "",
          item?.event || "",
          item?.keyword || "",
          item?.youtubeChannelTitle || item?.youtubeUsername || "",
          item?.title || "",
          item?.videoId || "",
          item?.contentLabel || item?.contentState || "",
          item?.discordChannelId || "",
          item?.link || ""
        ]);
      }

      sendAttachment(res, {
        contentType: "text/csv; charset=utf-8",
        filename: `conot-notifications-${routeContext.params.guildId}-${stamp}.csv`,
        content: toCsv(rows)
      });
    } catch (error) {
      sendInternalError(req, res, error);
    }
  });
}

module.exports = {
  registerNotificationRoutes
};
