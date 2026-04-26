"use strict";

const { ok } = require("@conot/shared-types");
const { sendJson } = require("../lib/http");

function registerSystemRoutes(router, appContext) {
  router.add("GET", "/v1", async (_req, res) => {
    sendJson(
      res,
      200,
      ok({
        service: "conot-dashboard-api",
        version: "0.1.0",
        authMode: appContext.env.authMode,
        storageDriver: appContext.storage?.driver || appContext.env.configStorageDriver || "json"
      })
    );
  });
}

module.exports = {
  registerSystemRoutes
};
