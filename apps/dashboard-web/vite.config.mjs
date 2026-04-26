import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sharedTypes = require("@conot/shared-types");
const { getConfigNumber, getConfigString } = require("../../src/config/appConfig");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, "../.."), "");
  if (env.CONOT_CONFIG_PATH && !process.env.CONOT_CONFIG_PATH) {
    process.env.CONOT_CONFIG_PATH = env.CONOT_CONFIG_PATH;
  }

  const port = Number(env.DASHBOARD_WEB_PORT || getConfigNumber("dashboard.webPort", null, 4320));
  const host = String(env.DASHBOARD_WEB_HOST || getConfigString("dashboard.webHost", null, "0.0.0.0"));
  const apiBaseUrl = String(
    env.DASHBOARD_API_BASE_URL || getConfigString("dashboard.apiBaseUrl", null, "http://localhost:4310")
  ).replace(/\/+$/, "");
  const webOrigin = String(
    env.DASHBOARD_WEB_ORIGIN || getConfigString("dashboard.webOrigin", null, `http://localhost:${port}`)
  ).replace(/\/+$/, "");

  return {
    plugins: [react()],
    server: {
      host,
      port,
      strictPort: false
    },
    preview: {
      host,
      port
    },
    define: {
      __CONOT_API_BASE__: JSON.stringify(apiBaseUrl),
      __CONOT_WEB_ORIGIN__: JSON.stringify(webOrigin),
      __CONOT_CONTENT_FILTERS__: JSON.stringify(sharedTypes.CONTENT_FILTERS),
      __CONOT_EMBED_LAYOUTS__: JSON.stringify(sharedTypes.EMBED_LAYOUTS),
      __CONOT_LOG_LEVELS__: JSON.stringify(sharedTypes.LOG_LEVELS)
    },
    build: {
      assetsInlineLimit: 0,
      sourcemap: false
    }
  };
});
