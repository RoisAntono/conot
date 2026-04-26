"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { getFileStats } = require("../services/healthService");

function defaultDb() {
  return {
    dataVersion: 5,
    globalSettings: {
      accessControl: {
        guildWhitelistEnabled: false,
        userWhitelistEnabled: false,
        leaveUnauthorizedGuilds: false,
        whitelistGuildIds: [],
        whitelistUserIds: [],
        updatedAt: null
      },
      logging: {
        devLogChannelId: null,
        devLogLevel: "warn",
        userIncludeErrorStack: false
      }
    },
    guildSettings: [],
    trackedChannels: [],
    guildLogs: [],
    auditLogs: [],
    notificationHistory: []
  };
}

function ensureShape(data) {
  const base = defaultDb();
  return {
    ...base,
    ...data,
    globalSettings: {
      ...base.globalSettings,
      ...(data.globalSettings || {}),
      accessControl: {
        ...base.globalSettings.accessControl,
        ...(data.globalSettings?.accessControl || {})
      },
      logging: {
        ...base.globalSettings.logging,
        ...(data.globalSettings?.logging || {})
      }
    },
    guildSettings: Array.isArray(data.guildSettings) ? data.guildSettings : [],
    trackedChannels: Array.isArray(data.trackedChannels) ? data.trackedChannels : [],
    guildLogs: Array.isArray(data.guildLogs) ? data.guildLogs : [],
    auditLogs: Array.isArray(data.auditLogs) ? data.auditLogs : [],
    notificationHistory: Array.isArray(data.notificationHistory) ? data.notificationHistory : []
  };
}

function nowIso() {
  return new Date().toISOString();
}

function toTimestamp(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function matchDateWindow(createdAt, fromTs, toTs) {
  const ts = toTimestamp(createdAt);
  if (!ts) {
    return false;
  }
  if (fromTs && ts < fromTs) {
    return false;
  }
  if (toTs && ts > toTs) {
    return false;
  }
  return true;
}

function normalizeSearchText(value) {
  return String(value || "").trim().toLowerCase();
}

function containsSearch(haystackItems, search) {
  if (!search) {
    return true;
  }
  const haystack = haystackItems
    .map((item) => String(item || ""))
    .join(" ")
    .toLowerCase();
  return haystack.includes(search);
}

function normalizeTrackerId(tracker, guildId) {
  if (tracker.id) {
    return tracker.id;
  }
  return `${guildId}:${tracker.youtube?.channelId || randomUUID()}`;
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || null;
}

function normalizeTrackerForApi(tracker, guildId) {
  const id = normalizeTrackerId(tracker, guildId);
  const configUpdatedAt = firstValue(tracker.configUpdatedAt, tracker.configuredAt, tracker.createdAt);
  const legacyStateUpdatedAt = tracker.lastVideoId ? tracker.updatedAt : null;
  const stateUpdatedAt = firstValue(tracker.stateUpdatedAt, tracker.lastCheckedAt, legacyStateUpdatedAt);
  const lastCheckedAt = firstValue(tracker.lastCheckedAt, stateUpdatedAt);

  return {
    ...tracker,
    id,
    configUpdatedAt,
    configuredAt: firstValue(tracker.configuredAt, configUpdatedAt),
    stateUpdatedAt,
    lastCheckedAt,
    lastVideoPublishedAt: firstValue(tracker.lastVideoPublishedAt, tracker.lastPublishedAt),
    updatedAt: firstValue(tracker.updatedAt, stateUpdatedAt, configUpdatedAt)
  };
}

function normalizeTitleWatchForApi(watch) {
  const configUpdatedAt = firstValue(watch.configUpdatedAt, watch.configuredAt, watch.createdAt);
  const stateUpdatedAt = firstValue(watch.stateUpdatedAt, watch.updatedAt, watch.createdAt);
  const lastMatchedAt = firstValue(watch.lastMatchedAt, watch.lastVideoId ? stateUpdatedAt : null);

  return {
    ...watch,
    configUpdatedAt,
    configuredAt: firstValue(watch.configuredAt, configUpdatedAt),
    stateUpdatedAt,
    lastMatchedAt,
    updatedAt: firstValue(watch.updatedAt, stateUpdatedAt, configUpdatedAt)
  };
}

class JsonConfigRepository {
  constructor(options = {}) {
    this.dataFilePath = options.dataFilePath;
    this.writeQueue = Promise.resolve();
  }

  async ensureFile() {
    await fs.mkdir(path.dirname(this.dataFilePath), { recursive: true });
    try {
      await fs.access(this.dataFilePath);
    } catch {
      await fs.writeFile(this.dataFilePath, JSON.stringify(defaultDb(), null, 2), "utf8");
    }
  }

  async read() {
    await this.ensureFile();
    const raw = await fs.readFile(this.dataFilePath, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return ensureShape(parsed);
  }

  async write(data) {
    await this.ensureFile();
    await fs.writeFile(this.dataFilePath, JSON.stringify(ensureShape(data), null, 2), "utf8");
  }

  mutate(mutator) {
    const writeTask = this.writeQueue.then(async () => {
      const data = await this.read();
      const draft = structuredClone(data);
      const maybeNext = await mutator(draft);
      const next = maybeNext || draft;
      await this.write(next);
      return next;
    });

    this.writeQueue = writeTask.catch(() => undefined);
    return writeTask;
  }

  async getDataFileStats() {
    return getFileStats(this.dataFilePath);
  }

  getStorageInfo() {
    return {
      driver: "json",
      filePath: this.dataFilePath
    };
  }

  async getGuildSettings(guildId) {
    const data = await this.read();
    return data.guildSettings.find((item) => item.guildId === guildId) || null;
  }

  async upsertGuildSettings(guildId, patch, actorUserId) {
    return this.mutate((data) => {
      const now = nowIso();
      const existing = data.guildSettings.find((item) => item.guildId === guildId);
      if (existing) {
        Object.assign(existing, patch, { guildId, updatedAt: now });
      } else {
        data.guildSettings.push({
          guildId,
          prefix: "?n",
          titleWatches: [],
          previewOnAdd: true,
          logChannelId: null,
          logLevel: "warn",
          ...patch,
          updatedAt: now
        });
      }

      this.appendAuditLog(data, {
        guildId,
        actorUserId,
        action: "settings.updated",
        resourceType: "setting",
        resourceId: guildId,
        before: null,
        after: patch
      });
      return data;
    });
  }

  async listTrackers(guildId) {
    const data = await this.read();
    return data.trackedChannels
      .filter((tracker) => tracker?.discord?.guildId === guildId)
      .map((tracker) => normalizeTrackerForApi(tracker, guildId));
  }

  async createTracker(guildId, payload, actorUserId) {
    const createdAt = nowIso();
    const record = {
      id: randomUUID(),
      youtube: payload.youtube,
      discord: {
        guildId,
        channelId: payload.discord.channelId,
        roleId: payload.discord.roleId || null
      },
      notifications: {
        contentFilter: payload.notifications.contentFilter,
        embedLayout: payload.notifications.embedLayout,
        customMessage: payload.notifications.customMessage || null,
        titleFilters: payload.notifications.titleFilters || []
      },
      lastVideoId: null,
      lastVideoUrl: null,
      lastPublishedAt: null,
      configUpdatedAt: createdAt,
      configuredAt: createdAt,
      stateUpdatedAt: null,
      lastCheckedAt: null,
      createdAt,
      updatedAt: createdAt
    };

    await this.mutate((data) => {
      data.trackedChannels.push(record);
      this.appendAuditLog(data, {
        guildId,
        actorUserId,
        action: "tracker.created",
        resourceType: "tracker",
        resourceId: record.id,
        before: null,
        after: record
      });
      return data;
    });

    return normalizeTrackerForApi(record, guildId);
  }

  async updateTracker(guildId, trackerId, patch, actorUserId) {
    let updated = null;
    await this.mutate((data) => {
      const tracker = data.trackedChannels.find(
        (item) => item?.discord?.guildId === guildId && normalizeTrackerId(item, guildId) === trackerId
      );
      if (!tracker) {
        return data;
      }

      const before = structuredClone(tracker);
      if (patch.channelId != null) {
        tracker.discord.channelId = patch.channelId;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "roleId")) {
        tracker.discord.roleId = patch.roleId;
      }
      if (patch.contentFilter) {
        tracker.notifications.contentFilter = patch.contentFilter;
      }
      if (patch.embedLayout) {
        tracker.notifications.embedLayout = patch.embedLayout;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "customMessage")) {
        tracker.notifications.customMessage = patch.customMessage;
      }
      if (patch.titleFilters) {
        tracker.notifications.titleFilters = patch.titleFilters;
      }
      const updatedAt = nowIso();
      tracker.configUpdatedAt = updatedAt;
      tracker.configuredAt = tracker.configuredAt || tracker.createdAt || updatedAt;
      tracker.updatedAt = updatedAt;
      updated = normalizeTrackerForApi(tracker, guildId);

      this.appendAuditLog(data, {
        guildId,
        actorUserId,
        action: "tracker.updated",
        resourceType: "tracker",
        resourceId: normalizeTrackerId(tracker, guildId),
        before,
        after: tracker
      });

      return data;
    });

    return updated;
  }

  async deleteTracker(guildId, trackerId, actorUserId) {
    let removed = null;
    await this.mutate((data) => {
      const index = data.trackedChannels.findIndex(
        (item) => item?.discord?.guildId === guildId && normalizeTrackerId(item, guildId) === trackerId
      );
      if (index < 0) {
        return data;
      }
      removed = data.trackedChannels[index];
      data.trackedChannels.splice(index, 1);
      this.appendAuditLog(data, {
        guildId,
        actorUserId,
        action: "tracker.deleted",
        resourceType: "tracker",
        resourceId: trackerId,
        before: removed,
        after: null
      });
      return data;
    });
    return removed;
  }

  async listTitleWatches(guildId) {
    const settings = await this.getGuildSettings(guildId);
    return (settings?.titleWatches || []).map(normalizeTitleWatchForApi);
  }

  async createTitleWatch(guildId, payload, actorUserId) {
    const createdAt = nowIso();
    const record = {
      id: randomUUID(),
      keyword: payload.keyword,
      channelId: payload.channelId,
      roleId: payload.roleId || null,
      maxAgeDays: payload.maxAgeDays,
      lastVideoId: null,
      recentVideoIds: [],
      configUpdatedAt: createdAt,
      configuredAt: createdAt,
      stateUpdatedAt: null,
      lastMatchedAt: null,
      createdAt,
      updatedAt: createdAt
    };

    await this.mutate((data) => {
      let settings = data.guildSettings.find((item) => item.guildId === guildId);
      if (!settings) {
        settings = {
          guildId,
          prefix: "?n",
          titleWatches: [],
          previewOnAdd: true,
          logChannelId: null,
          logLevel: "warn",
          updatedAt: nowIso()
        };
        data.guildSettings.push(settings);
      }
      settings.titleWatches = settings.titleWatches || [];
      settings.titleWatches.push(record);
      settings.updatedAt = nowIso();

      this.appendAuditLog(data, {
        guildId,
        actorUserId,
        action: "titlewatch.created",
        resourceType: "titlewatch",
        resourceId: record.id,
        before: null,
        after: record
      });
      return data;
    });

    return normalizeTitleWatchForApi(record);
  }

  async updateTitleWatch(guildId, watchId, patch, actorUserId) {
    let updated = null;
    await this.mutate((data) => {
      const settings = data.guildSettings.find((item) => item.guildId === guildId);
      if (!settings?.titleWatches) {
        return data;
      }
      const watch = settings.titleWatches.find((item) => item.id === watchId);
      if (!watch) {
        return data;
      }

      const before = structuredClone(watch);
      const updatedAt = nowIso();
      Object.assign(watch, patch, {
        configUpdatedAt: updatedAt,
        configuredAt: watch.configuredAt || watch.createdAt || updatedAt,
        updatedAt
      });
      updated = normalizeTitleWatchForApi(watch);

      this.appendAuditLog(data, {
        guildId,
        actorUserId,
        action: "titlewatch.updated",
        resourceType: "titlewatch",
        resourceId: watchId,
        before,
        after: watch
      });
      return data;
    });
    return updated;
  }

  async deleteTitleWatch(guildId, watchId, actorUserId) {
    let removed = null;
    await this.mutate((data) => {
      const settings = data.guildSettings.find((item) => item.guildId === guildId);
      if (!settings?.titleWatches) {
        return data;
      }
      const index = settings.titleWatches.findIndex((item) => item.id === watchId);
      if (index < 0) {
        return data;
      }
      removed = settings.titleWatches[index];
      settings.titleWatches.splice(index, 1);
      settings.updatedAt = nowIso();

      this.appendAuditLog(data, {
        guildId,
        actorUserId,
        action: "titlewatch.deleted",
        resourceType: "titlewatch",
        resourceId: watchId,
        before: removed,
        after: null
      });
      return data;
    });
    return removed;
  }

  async appendGuildLog(guildId, payload) {
    await this.mutate((data) => {
      data.guildLogs.push({
        id: randomUUID(),
        guildId,
        createdAt: nowIso(),
        ...payload
      });
      data.guildLogs = data.guildLogs.slice(-1000);
      return data;
    });
  }

  async listGuildLogs(guildId, query = {}) {
    const search = normalizeSearchText(query.q);
    const fromTs = toTimestamp(query.from);
    const toTs = toTimestamp(query.to);
    const limit = Number.isInteger(query.limit) ? Math.max(1, Math.min(1000, query.limit)) : 200;
    const data = await this.read();
    return data.guildLogs
      .filter((item) => item.guildId === guildId)
      .filter((item) => (query.level ? item.level === query.level : true))
      .filter((item) => (query.scope ? item.scope === query.scope : true))
      .filter((item) => (fromTs || toTs ? matchDateWindow(item.createdAt, fromTs, toTs) : true))
      .filter((item) => {
        return containsSearch(
          [item.level, item.scope, item.message, item.meta ? JSON.stringify(item.meta) : ""],
          search
        );
      })
      .slice(-limit)
      .reverse();
  }

  async listAuditLogs(guildId, query = {}) {
    const limit = Number.isInteger(query.limit) ? Math.max(1, Math.min(500, query.limit)) : 100;
    const search = normalizeSearchText(query.q);
    const fromTs = toTimestamp(query.from);
    const toTs = toTimestamp(query.to);
    const data = await this.read();
    return data.auditLogs
      .filter((item) => item.guildId === guildId)
      .filter((item) => (query.action ? item.action === query.action : true))
      .filter((item) => (query.resourceType ? item.resourceType === query.resourceType : true))
      .filter((item) => (query.actorUserId ? String(item.actorUserId || "") === String(query.actorUserId) : true))
      .filter((item) => (fromTs || toTs ? matchDateWindow(item.createdAt, fromTs, toTs) : true))
      .filter((item) => {
        return containsSearch(
          [
            item.action,
            item.resourceType,
            item.resourceId,
            item.actorUserId,
            item.before ? JSON.stringify(item.before) : "",
            item.after ? JSON.stringify(item.after) : ""
          ],
          search
        );
      })
      .slice(-limit)
      .reverse();
  }

  async listNotificationHistory(guildId, query = {}) {
    const limit = Number.isInteger(query.limit) ? Math.max(1, Math.min(500, query.limit)) : 120;
    const search = normalizeSearchText(query.q);
    const fromTs = toTimestamp(query.from);
    const toTs = toTimestamp(query.to);
    const data = await this.read();
    return data.notificationHistory
      .filter((item) => item.guildId === guildId)
      .filter((item) => (query.source ? item.source === query.source : true))
      .filter((item) => (query.status ? item.status === query.status : true))
      .filter((item) => (query.event ? item.event === query.event : true))
      .filter((item) => (fromTs || toTs ? matchDateWindow(item.createdAt, fromTs, toTs) : true))
      .filter((item) => {
        return containsSearch(
          [
            item.source,
            item.status,
            item.event,
            item.keyword,
            item.youtubeChannelId,
            item.youtubeChannelTitle,
            item.youtubeUsername,
            item.videoId,
            item.title,
            item.link,
            item.contentLabel,
            item.contentState,
            item.discordChannelId
          ],
          search
        );
      })
      .slice(-limit)
      .reverse();
  }

  appendAuditLog(data, payload) {
    data.auditLogs.push({
      id: randomUUID(),
      createdAt: nowIso(),
      ...payload
    });
    data.auditLogs = data.auditLogs.slice(-3000);
  }
}

module.exports = {
  JsonConfigRepository,
  defaultDb,
  ensureShape
};
