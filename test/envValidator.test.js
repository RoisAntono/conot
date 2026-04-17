const test = require("node:test");
const assert = require("node:assert/strict");
const {
  __private,
  validateEnvironmentVariables
} = require("../src/utils/envValidator");

test("validateEnvironmentVariables accepts minimal valid env", () => {
  assert.doesNotThrow(() => {
    validateEnvironmentVariables({
      DISCORD_TOKEN: "test_discord_token_value_1234567890"
    });
  });
});

test("validateEnvironmentVariables rejects invalid numeric env", () => {
  assert.throws(() => {
    validateEnvironmentVariables({
      DISCORD_TOKEN: "test_discord_token_value_1234567890",
      RSS_RECENT_VIDEOS_LIMIT: "abc"
    });
  }, /RSS_RECENT_VIDEOS_LIMIT/);
});

test("validateEnvironmentVariables rejects invalid boolean env", () => {
  assert.throws(() => {
    validateEnvironmentVariables({
      DISCORD_TOKEN: "test_discord_token_value_1234567890",
      CANARY_ENABLED: "maybe"
    });
  }, /CANARY_ENABLED/);
});

test("validateEnvironmentVariables rejects invalid snowflake list env", () => {
  assert.throws(() => {
    validateEnvironmentVariables({
      DISCORD_TOKEN: "test_discord_token_value_1234567890",
      BOT_OWNER_IDS: "123,abc"
    });
  }, /BOT_OWNER_IDS/);
});

test("validateEnvironmentVariables rejects invalid webhook url", () => {
  assert.throws(() => {
    validateEnvironmentVariables({
      DISCORD_TOKEN: "test_discord_token_value_1234567890",
      EXTERNAL_LOG_WEBHOOK_URL: "ftp://example.com/hook"
    });
  }, /EXTERNAL_LOG_WEBHOOK_URL/);
});

test("validateEnvironmentVariables rejects placeholder discord token", () => {
  assert.throws(() => {
    validateEnvironmentVariables({
      DISCORD_TOKEN: "your_discord_bot_token"
    });
  }, /placeholder/);
});

test("validateEnvironmentVariables rejects user whitelist without owner ids", () => {
  assert.throws(() => {
    validateEnvironmentVariables({
      DISCORD_TOKEN: "test_discord_token_value_1234567890",
      GUARD_USER_WHITELIST_ENABLED: "true"
    });
  }, /BOT_OWNER_IDS\/OWNER_USER_IDS/);
});

test("collectEnvironmentIssues returns all detected issues", () => {
  const issues = __private.collectEnvironmentIssues({
    DISCORD_TOKEN: "",
    RSS_RECENT_VIDEOS_LIMIT: "0",
    CANARY_ENABLED: "invalid"
  });

  assert.equal(issues.length >= 3, true);
  assert.ok(issues.some((item) => item.includes("DISCORD_TOKEN")));
  assert.ok(issues.some((item) => item.includes("RSS_RECENT_VIDEOS_LIMIT")));
  assert.ok(issues.some((item) => item.includes("CANARY_ENABLED")));
});
