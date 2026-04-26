"use strict";

const { isNonEmptyString, normalizeString, validate } = require("./common");

function validateTitleWatchCreate(input) {
  const payload = input || {};
  const result = validate(
    {
      keyword(value) {
        if (!isNonEmptyString(value)) return "keyword wajib diisi.";
        const normalized = normalizeString(value);
        if (normalized.length < 2) return "keyword minimal 2 karakter.";
        if (normalized.length > 120) return "keyword maksimal 120 karakter.";
        return null;
      },
      channelId(value) {
        if (!isNonEmptyString(value)) return "channelId wajib diisi.";
        return null;
      },
      roleId(value) {
        if (value == null) return null;
        if (typeof value !== "string") return "roleId harus string/null.";
        return null;
      },
      maxAgeDays(value) {
        if (value == null) return null;
        if (!Number.isInteger(value) || value < 1 || value > 30) {
          return "maxAgeDays harus integer 1..30.";
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
    errors: [],
    data: {
      keyword: normalizeString(payload.keyword),
      channelId: normalizeString(payload.channelId),
      roleId: payload.roleId || null,
      maxAgeDays: payload.maxAgeDays ?? 3
    }
  };
}

function validateTitleWatchPatch(input) {
  const payload = input || {};
  const result = validate(
    {
      keyword(value) {
        if (value == null) return null;
        if (!isNonEmptyString(value)) return "keyword tidak valid.";
        return null;
      },
      channelId(value) {
        if (value == null) return null;
        if (!isNonEmptyString(value)) return "channelId tidak valid.";
        return null;
      },
      roleId(value) {
        if (value == null) return null;
        if (typeof value !== "string") return "roleId harus string.";
        return null;
      },
      maxAgeDays(value) {
        if (value == null) return null;
        if (!Number.isInteger(value) || value < 1 || value > 30) {
          return "maxAgeDays harus integer 1..30.";
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
    errors: [],
    data: {
      ...(payload.keyword != null ? { keyword: normalizeString(payload.keyword) } : {}),
      ...(payload.channelId != null ? { channelId: normalizeString(payload.channelId) } : {}),
      ...(payload.roleId !== undefined ? { roleId: payload.roleId } : {}),
      ...(payload.maxAgeDays != null ? { maxAgeDays: payload.maxAgeDays } : {})
    }
  };
}

module.exports = {
  validateTitleWatchCreate,
  validateTitleWatchPatch
};
