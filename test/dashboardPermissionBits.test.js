const test = require("node:test");
const assert = require("node:assert/strict");
const { hasManageGuildPermission } = require("@conot/shared-types");

test("hasManageGuildPermission menerima bit MANAGE_GUILD", () => {
  assert.equal(hasManageGuildPermission("32"), true);
});

test("hasManageGuildPermission menerima bit ADMINISTRATOR", () => {
  assert.equal(hasManageGuildPermission("8"), true);
});

test("hasManageGuildPermission menolak permission tanpa admin/manage_guild", () => {
  assert.equal(hasManageGuildPermission("1024"), false);
});
