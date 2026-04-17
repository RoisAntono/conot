const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeExternalError } = require("../src/utils/errorSanitizer");

test("sanitizeExternalError redacts Windows absolute paths", () => {
  const error = new Error("boom");
  error.stack = [
    "Error: boom",
    "    at AxiosError.from (C:\\Users\\ROIS\\OneDrive\\Documents\\node\\Conot\\node_modules\\axios\\dist\\node\\axios.cjs:874:24)"
  ].join("\n");

  const result = sanitizeExternalError(error);
  assert.match(result, /\[redacted-path\]/);
  assert.doesNotMatch(result, /C:\\Users\\ROIS\\/);
});

test("sanitizeExternalError redacts Unix absolute paths", () => {
  const raw = "Error: boom at doThing (/home/ubuntu/app/src/index.js:10:2)";
  const result = sanitizeExternalError(raw);

  assert.match(result, /\[redacted-path\]/);
  assert.doesNotMatch(result, /\/home\/ubuntu\/app/);
});
