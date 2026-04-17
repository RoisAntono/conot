const test = require("node:test");
const assert = require("node:assert/strict");
const { __private } = require("../src/services/youtubePoller");

test.afterEach(() => {
  __private.resetRuntimeGuardState();
});

test("shouldEmitRssFailureLog emits at threshold and repeats by interval", () => {
  assert.equal(__private.shouldEmitRssFailureLog(1), false);
  assert.equal(__private.shouldEmitRssFailureLog(2), false);
  assert.equal(__private.shouldEmitRssFailureLog(3), true);
  assert.equal(__private.shouldEmitRssFailureLog(4), false);
});

test("recent notification history blocks repeated signature", () => {
  const trackedChannel = {
    discord: { guildId: "1", channelId: "2", roleId: null },
    youtube: { channelId: "UC1234567890123456789012" }
  };
  const signature = "new:abc:uploaded:2:none";

  assert.equal(__private.shouldSkipByRecentHistory("tracker", trackedChannel, signature), false);
  __private.rememberRecentHistory("tracker", trackedChannel, signature);
  assert.equal(__private.shouldSkipByRecentHistory("tracker", trackedChannel, signature), true);
});

test("success guard blocks exact repeated notification signature", () => {
  const tracker = {
    lastNotificationSignature: "new:abc:uploaded:2:none"
  };

  assert.equal(
    __private.shouldSkipBySuccessGuard(tracker, "new:abc:uploaded:2:none"),
    true
  );
  assert.equal(
    __private.shouldSkipBySuccessGuard(tracker, "new:def:uploaded:2:none"),
    false
  );
});

test("attempt guard blocks retry in guard window and allows after expired", () => {
  const now = Date.now();
  const tracker = {
    lastDeliveryAttemptSignature: "new:abc:uploaded:2:none",
    lastDeliveryAttemptAt: new Date(now - 60_000).toISOString()
  };

  assert.equal(
    __private.shouldSkipByAttemptGuard(tracker, "new:abc:uploaded:2:none"),
    true
  );

  tracker.lastDeliveryAttemptAt = new Date(now - (31 * 60 * 1000)).toISOString();
  assert.equal(
    __private.shouldSkipByAttemptGuard(tracker, "new:abc:uploaded:2:none"),
    false
  );
});

test("combined guard helper returns guard reason consistently", () => {
  const tracker = {
    discord: { guildId: "1", channelId: "2", roleId: null },
    youtube: { channelId: "UC1234567890123456789012" },
    lastNotificationSignature: "new:abc:uploaded:2:none",
    lastDeliveryAttemptSignature: "new:abc:uploaded:2:none",
    lastDeliveryAttemptAt: new Date().toISOString()
  };
  const signature = "new:abc:uploaded:2:none";

  const successSkip = __private.shouldSkipNotificationByGuards("tracker", tracker, signature);
  assert.deepEqual(successSkip, { skip: true, reason: "success_guard" });

  tracker.lastNotificationSignature = null;
  const attemptSkip = __private.shouldSkipNotificationByGuards("tracker", tracker, signature);
  assert.deepEqual(attemptSkip, { skip: true, reason: "attempt_guard" });

  tracker.lastDeliveryAttemptAt = new Date(Date.now() - (31 * 60 * 1000)).toISOString();
  __private.rememberRecentHistory("tracker", tracker, signature);
  const recentSkip = __private.shouldSkipNotificationByGuards("tracker", tracker, signature);
  assert.deepEqual(recentSkip, { skip: true, reason: "recent_history_guard" });
});
