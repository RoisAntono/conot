const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyNetworkError } = require("../src/utils/networkRetry");

test("classifyNetworkError marks ENOTFOUND as transient", () => {
  const result = classifyNetworkError({ code: "ENOTFOUND" });
  assert.equal(result.isTransient, true);
  assert.equal(result.type, "transient");
});

test("classifyNetworkError marks HTTP 404 as permanent", () => {
  const result = classifyNetworkError({ response: { status: 404 } });
  assert.equal(result.isTransient, false);
  assert.equal(result.type, "permanent");
});

test("classifyNetworkError marks HTTP 503 as transient", () => {
  const result = classifyNetworkError({ response: { status: 503 } });
  assert.equal(result.isTransient, true);
  assert.equal(result.type, "transient");
});

test("classifyNetworkError reads status from generic error message", () => {
  const result = classifyNetworkError({ message: "Error: Status code 500" });
  assert.equal(result.status, 500);
  assert.equal(result.isTransient, true);
});
