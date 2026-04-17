const test = require("node:test");
const assert = require("node:assert/strict");
const {
  consumeCommandRateLimit,
  resetCommandRateLimitState
} = require("../src/services/commandRateLimitService");

test.afterEach(() => {
  resetCommandRateLimitState();
});

test("consumeCommandRateLimit allows first call and blocks immediate retry", () => {
  const first = consumeCommandRateLimit({
    guildId: "1",
    userId: "2",
    commandKey: "addchannel",
    windowMs: 1000
  });
  const second = consumeCommandRateLimit({
    guildId: "1",
    userId: "2",
    commandKey: "addchannel",
    windowMs: 1000
  });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.ok(second.retryAfterMs > 0);
});

test("consumeCommandRateLimit is isolated per command key", () => {
  consumeCommandRateLimit({
    guildId: "1",
    userId: "2",
    commandKey: "addchannel",
    windowMs: 1000
  });

  const otherCommand = consumeCommandRateLimit({
    guildId: "1",
    userId: "2",
    commandKey: "updatechannel",
    windowMs: 1000
  });

  assert.equal(otherCommand.allowed, true);
});

test("consumeCommandRateLimit blocks shared bucket key across commands", () => {
  const firstBucket = consumeCommandRateLimit({
    guildId: "1",
    userId: "2",
    commandKey: "bucket:sensitive_setup",
    windowMs: 1000
  });

  const secondBucket = consumeCommandRateLimit({
    guildId: "1",
    userId: "2",
    commandKey: "bucket:sensitive_setup",
    windowMs: 1000
  });

  assert.equal(firstBucket.allowed, true);
  assert.equal(secondBucket.allowed, false);
});
