const test = require("node:test");
const assert = require("node:assert/strict");
const { PermissionFlagsBits } = require("discord.js");
const {
  diagnoseChannelAccess,
  diagnoseDiscordSendError
} = require("../src/utils/discordDeliveryDiagnostics");

test("diagnoseChannelAccess returns missing permissions details", () => {
  const diagnosis = diagnoseChannelAccess(
    {
      permissionsFor() {
        return {
          has(permission) {
            return permission !== PermissionFlagsBits.EmbedLinks;
          }
        };
      }
    },
    { id: "bot-user" }
  );

  assert.equal(diagnosis.ok, false);
  assert.ok(diagnosis.missingPermissions.includes(PermissionFlagsBits.EmbedLinks));
  assert.match(diagnosis.cause, /Bot tidak memiliki permission/);
});

test("diagnoseChannelAccess marks healthy channel as ok", () => {
  const diagnosis = diagnoseChannelAccess(
    {
      permissionsFor() {
        return {
          has() {
            return true;
          }
        };
      }
    },
    { id: "bot-user" }
  );

  assert.equal(diagnosis.ok, true);
  assert.deepEqual(diagnosis.missingPermissions, []);
});

test("diagnoseDiscordSendError memetakan permission failure 50013 ke solusi channel permission", () => {
  const error = { code: 50013 };
  const diagnosis = diagnoseDiscordSendError({
    channel: {
      permissionsFor() {
        return {
          has(permission) {
            return permission !== PermissionFlagsBits.SendMessages;
          }
        };
      },
      guild: {
        roles: {
          cache: new Map()
        }
      }
    },
    clientUser: { id: "bot-user" },
    error,
    roleId: "123456789012345678"
  });

  assert.match(diagnosis.cause, /Bot tidak memiliki permission/);
  assert.match(diagnosis.solution, /Send Messages/);
});
