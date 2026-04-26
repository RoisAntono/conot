"use strict";

const { LOG_LEVELS } = require("@conot/shared-types");
const { normalizeString, validate } = require("./common");

function validateSettingsPatch(input) {
  const payload = input || {};
  const result = validate(
    {
      prefix(value) {
        if (value == null) return null;
        const normalized = normalizeString(value);
        if (!normalized) return "prefix tidak boleh kosong.";
        if (normalized.length > 10) return "prefix maksimal 10 karakter.";
        return null;
      },
      previewOnAdd(value) {
        if (value == null) return null;
        if (typeof value !== "boolean") return "previewOnAdd harus boolean.";
        return null;
      },
      logChannelId(value) {
        if (value == null) return null;
        if (typeof value !== "string") return "logChannelId harus string.";
        if (!value.trim()) return "logChannelId tidak boleh kosong.";
        return null;
      },
      logLevel(value) {
        if (value == null) return null;
        if (!LOG_LEVELS.includes(value)) {
          return `logLevel harus salah satu dari: ${LOG_LEVELS.join(", ")}.`;
        }
        return null;
      }
    },
    payload
  );

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: {
      ...(payload.prefix != null ? { prefix: normalizeString(payload.prefix) } : {}),
      ...(payload.previewOnAdd != null ? { previewOnAdd: payload.previewOnAdd } : {}),
      ...(payload.logChannelId !== undefined ? { logChannelId: payload.logChannelId } : {}),
      ...(payload.logLevel != null ? { logLevel: payload.logLevel } : {})
    },
    errors: []
  };
}

module.exports = {
  validateSettingsPatch
};
