const test = require("node:test");
const assert = require("node:assert/strict");
const { parseTrackerCommandArgs } = require("../src/utils/trackerCommandParser");

test("parseTrackerCommandArgs parses refresh-source flag", () => {
  const parsed = parseTrackerCommandArgs([
    "@windahbasudara",
    "<#123456789012345678>",
    "all",
    "--refresh-source"
  ]);

  assert.equal(parsed.username, "@windahbasudara");
  assert.equal(parsed.rawChannelArg, "<#123456789012345678>");
  assert.equal(parsed.contentFilter, "all");
  assert.equal(parsed.refreshSource, true);
});

test("parseTrackerCommandArgs does not leak --refresh-source into custom message", () => {
  const parsed = parseTrackerCommandArgs([
    "@windahbasudara",
    "--message",
    "Halo dunia",
    "--refresh-source"
  ]);

  assert.equal(parsed.customMessage, "Halo dunia");
  assert.equal(parsed.refreshSource, true);
});
