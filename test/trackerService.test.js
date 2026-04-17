const test = require("node:test");
const assert = require("node:assert/strict");
const { __private } = require("../src/services/trackerService");

test("ensureSourceRefreshAllowed rejects refresh on direct channel ID", () => {
  assert.throws(
    () => __private.ensureSourceRefreshAllowed("UC1234567890123456789012", true),
    /Refresh source hanya bisa dipakai/
  );
});

test("ensureSourceRefreshAllowed allows refresh on handle", () => {
  assert.doesNotThrow(() => __private.ensureSourceRefreshAllowed("@windahbasudara", true));
});
