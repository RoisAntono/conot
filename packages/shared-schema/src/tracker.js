"use strict";

const { CONTENT_FILTERS, EMBED_LAYOUTS } = require("@conot/shared-types");
const { isNonEmptyString, normalizeString, toArray, validate } = require("./common");

function validateTrackerCreate(input) {
  const payload = input || {};
  const result = validate(
    {
      youtube(value) {
        if (typeof value !== "object" || value == null) return "youtube wajib object.";
        if (!isNonEmptyString(value.username)) return "youtube.username wajib diisi.";
        if (!isNonEmptyString(value.channelId)) return "youtube.channelId wajib diisi.";
        if (!isNonEmptyString(value.title)) return "youtube.title wajib diisi.";
        return null;
      },
      discord(value) {
        if (typeof value !== "object" || value == null) return "discord wajib object.";
        if (!isNonEmptyString(value.channelId)) return "discord.channelId wajib diisi.";
        if (value.roleId != null && typeof value.roleId !== "string") {
          return "discord.roleId harus string/null.";
        }
        return null;
      },
      notifications(value) {
        if (typeof value !== "object" || value == null) return "notifications wajib object.";
        if (!CONTENT_FILTERS.includes(value.contentFilter || "all")) {
          return "notifications.contentFilter tidak valid.";
        }
        if (value.embedLayout && !EMBED_LAYOUTS.includes(value.embedLayout)) {
          return "notifications.embedLayout tidak valid.";
        }
        if (value.customMessage != null && typeof value.customMessage !== "string") {
          return "notifications.customMessage harus string.";
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
      youtube: {
        username: normalizeString(payload.youtube.username),
        channelId: normalizeString(payload.youtube.channelId),
        title: normalizeString(payload.youtube.title)
      },
      discord: {
        channelId: normalizeString(payload.discord.channelId),
        roleId: payload.discord.roleId || null
      },
      notifications: {
        contentFilter: payload.notifications.contentFilter || "all",
        embedLayout: payload.notifications.embedLayout || "compact",
        customMessage: payload.notifications.customMessage || null,
        titleFilters: toArray(payload.notifications.titleFilters)
      }
    }
  };
}

function validateTrackerPatch(input) {
  const payload = input || {};
  const result = validate(
    {
      contentFilter(value) {
        if (value == null) return null;
        if (!CONTENT_FILTERS.includes(value)) return "contentFilter tidak valid.";
        return null;
      },
      embedLayout(value) {
        if (value == null) return null;
        if (!EMBED_LAYOUTS.includes(value)) return "embedLayout tidak valid.";
        return null;
      },
      customMessage(value) {
        if (value == null) return null;
        if (typeof value !== "string") return "customMessage harus string.";
        return null;
      },
      titleFilters(value) {
        if (value == null) return null;
        if (!Array.isArray(value) && typeof value !== "string") {
          return "titleFilters harus array/string.";
        }
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
      ...(payload.contentFilter != null ? { contentFilter: payload.contentFilter } : {}),
      ...(payload.embedLayout != null ? { embedLayout: payload.embedLayout } : {}),
      ...(payload.customMessage !== undefined ? { customMessage: payload.customMessage } : {}),
      ...(payload.titleFilters != null ? { titleFilters: toArray(payload.titleFilters) } : {}),
      ...(payload.channelId != null ? { channelId: normalizeString(payload.channelId) } : {}),
      ...(payload.roleId !== undefined ? { roleId: payload.roleId } : {})
    }
  };
}

module.exports = {
  validateTrackerCreate,
  validateTrackerPatch
};
