"use strict";

const path = require("node:path");
const { defineConfig, devices } = require("@playwright/test");

const rootDir = path.resolve(__dirname, "../..");
const dataDir = path.resolve(__dirname, ".playwright-data");

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  workers: 1,
  expect: {
    timeout: 8_000
  },
  use: {
    baseURL: "http://localhost:4420",
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "npm run dev:api",
      cwd: rootDir,
      env: {
        ...process.env,
        DASHBOARD_AUTH_MODE: "mock",
        DASHBOARD_MOCK_AUTO_LOGIN: "true",
        DASHBOARD_MOCK_GUILD_IDS: "123456789012345678",
        DASHBOARD_MOCK_ADMIN_GUILD_IDS: "123456789012345678",
        DASHBOARD_API_PORT: "4410",
        DASHBOARD_API_BASE_URL: "http://localhost:4410",
        DASHBOARD_WEB_ORIGIN: "http://localhost:4420",
        DASHBOARD_DEFAULT_RETURN_TO: "http://localhost:4420/dashboard",
        DISCORD_REDIRECT_URI: "http://localhost:4410/v1/auth/discord/callback",
        DISCORD_TOKEN: "",
        DATA_FILE_PATH: path.join(dataDir, "data.json"),
        DASHBOARD_SESSION_FILE_PATH: path.join(dataDir, "sessions.json")
      },
      url: "http://localhost:4410/v1/auth/discord/login",
      reuseExistingServer: true,
      timeout: 30_000
    },
    {
      command: "npm run dev:web",
      cwd: rootDir,
      env: {
        ...process.env,
        DASHBOARD_API_BASE_URL: "http://localhost:4410",
        DASHBOARD_WEB_ORIGIN: "http://localhost:4420",
        DASHBOARD_WEB_PORT: "4420"
      },
      url: "http://localhost:4420",
      reuseExistingServer: true,
      timeout: 30_000
    }
  ],
  projects: [
    {
      name: "mobile-390",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 }
      }
    },
    {
      name: "tablet-768",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 }
      }
    },
    {
      name: "desktop-1024",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1024, height: 768 }
      }
    },
    {
      name: "wide-1440",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 }
      }
    }
  ]
});
