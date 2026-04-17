const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePrefixedMessage, tokenizeArgs } = require("../src/utils/prefixParser");

test("tokenizeArgs keeps quoted segments together", () => {
  assert.deepEqual(
    tokenizeArgs('addchannel @deddy #podcast --title "Praz Teguh, Habib Jafar"'),
    ["addchannel", "@deddy", "#podcast", "--title", "Praz Teguh, Habib Jafar"]
  );
});

test("parsePrefixedMessage requires a space after prefix", () => {
  assert.equal(parsePrefixedMessage("?naddchannel @deddy", "?n"), null);
  assert.deepEqual(
    parsePrefixedMessage('?n addchannel @deddy #podcast --message "Halo dunia"', "?n"),
    {
      commandName: "addchannel",
      args: ["@deddy", "#podcast", "--message", "Halo dunia"],
      raw: 'addchannel @deddy #podcast --message "Halo dunia"'
    }
  );
});
