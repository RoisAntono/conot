"use strict";

const path = require("node:path");

function getWorkspaceRoot() {
  const configured = String(process.env.CONOT_WORKSPACE_ROOT || "").trim();
  if (configured) {
    return path.resolve(configured);
  }

  return path.resolve(__dirname, "../../../..");
}

function resolveRuntimePath(targetPath, fallbackPath) {
  const normalized = String(targetPath || fallbackPath || "").trim();
  const fallback = String(fallbackPath || "").trim();
  const value = normalized || fallback;

  if (!value) {
    return getWorkspaceRoot();
  }

  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(getWorkspaceRoot(), value);
}

module.exports = {
  getWorkspaceRoot,
  resolveRuntimePath
};
