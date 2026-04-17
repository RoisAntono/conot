const fs = require("node:fs/promises");
const path = require("node:path");
const {
  DATA_FILE,
  DATA_SCHEMA_VERSION,
  DEFAULT_CONTENT_FILTER,
  DEFAULT_DEV_LOG_LEVEL,
  DEFAULT_EMBED_LAYOUT,
  DEFAULT_GUILD_WHITELIST_ENABLED,
  DEFAULT_LEAVE_UNAUTHORIZED_GUILDS,
  DEFAULT_PREVIEW_ON_ADD,
  DEFAULT_USER_LOG_LEVEL,
  DEFAULT_TITLE_WATCH_MAX_AGE_DAYS,
  DEFAULT_USER_WHITELIST_ENABLED,
  LOG_LEVELS,
  TITLE_WATCH_HISTORY_LIMIT
} = require("../config/constants");
const { normalizeEmbedLayout } = require("./embedLayout");
const { decodeHtmlEntities } = require("./htmlEntities");
const logger = require("./logger");
const { normalizeTitleFilters } = require("./titleFilter");

function createDefaultData() {
  return {
    dataVersion: DATA_SCHEMA_VERSION,
    globalSettings: {
      accessControl: sanitizeAccessControl(null),
      logging: sanitizeGlobalLogging(null)
    },
    guildSettings: [],
    trackedChannels: []
  };
}

function sanitizeLogLevel(value, fallback = DEFAULT_USER_LOG_LEVEL) {
  const normalized = String(value || "").trim().toLowerCase();
  if (Object.values(LOG_LEVELS).includes(normalized)) {
    return normalized;
  }

  return fallback;
}

function sanitizeGlobalLogging(item) {
  return {
    devLogChannelId: item?.devLogChannelId ? String(item.devLogChannelId) : null,
    devLogLevel: sanitizeLogLevel(item?.devLogLevel, DEFAULT_DEV_LOG_LEVEL),
    userIncludeErrorStack: Boolean(item?.userIncludeErrorStack)
  };
}

function normalizeDataVersion(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function migrateToVersion2(data) {
  const migrated = {
    ...data,
    globalSettings: {
      ...(data?.globalSettings || {}),
      accessControl: sanitizeAccessControl(data?.globalSettings?.accessControl)
    },
    guildSettings: Array.isArray(data?.guildSettings)
      ? data.guildSettings.map((item) => ({
          ...item,
          titleWatches: Array.isArray(item?.titleWatches) ? item.titleWatches : []
        }))
      : [],
    trackedChannels: Array.isArray(data?.trackedChannels)
      ? data.trackedChannels.map((item) => ({
          ...item,
          notifications: {
            ...(item?.notifications || {}),
            titleFilters: normalizeTitleFilters(
              item?.notifications?.titleFilters ?? item?.notifications?.titleFilter ?? []
            )
          }
        }))
      : []
  };

  return migrated;
}

function migrateToVersion3(data) {
  return {
    ...data,
    globalSettings: {
      ...(data?.globalSettings || {}),
      accessControl: sanitizeAccessControl(data?.globalSettings?.accessControl),
      logging: sanitizeGlobalLogging(data?.globalSettings?.logging)
    },
    guildSettings: Array.isArray(data?.guildSettings)
      ? data.guildSettings.map((item) => ({
          ...item,
          logLevel: sanitizeLogLevel(item?.logLevel, DEFAULT_USER_LOG_LEVEL)
        }))
      : []
  };
}

function migrateToVersion4(data) {
  return {
    ...data,
    trackedChannels: Array.isArray(data?.trackedChannels)
      ? data.trackedChannels.map((item) => ({
          ...item,
          recentSeenVideoIds: normalizeRecentSeenVideoIds(item?.recentSeenVideoIds, item?.lastVideoId)
        }))
      : []
  };
}

function migrateData(rawData) {
  let current = rawData && typeof rawData === "object" ? { ...rawData } : createDefaultData();
  const initialVersion = normalizeDataVersion(current?.dataVersion);
  let workingVersion = initialVersion;
  let changed = workingVersion !== DATA_SCHEMA_VERSION;

  while (workingVersion < DATA_SCHEMA_VERSION) {
    if (workingVersion === 1) {
      current = migrateToVersion2(current);
      workingVersion = 2;
      changed = true;
      continue;
    }

    if (workingVersion === 2) {
      current = migrateToVersion3(current);
      workingVersion = 3;
      changed = true;
      continue;
    }

    if (workingVersion === 3) {
      current = migrateToVersion4(current);
      workingVersion = 4;
      changed = true;
      continue;
    }

    break;
  }

  return {
    data: {
      ...current,
      dataVersion: DATA_SCHEMA_VERSION
    },
    changed,
    fromVersion: initialVersion,
    toVersion: DATA_SCHEMA_VERSION
  };
}

function normalizeIdList(values) {
  const items = Array.isArray(values) ? values : [values];

  return [...new Set(items
    .map((value) => String(value || "").trim())
    .filter((value) => /^\d{10,}$/.test(value)))];
}

function sanitizeAccessControl(item) {
  return {
    guildWhitelistEnabled: typeof item?.guildWhitelistEnabled === "boolean"
      ? item.guildWhitelistEnabled
      : DEFAULT_GUILD_WHITELIST_ENABLED,
    userWhitelistEnabled: typeof item?.userWhitelistEnabled === "boolean"
      ? item.userWhitelistEnabled
      : DEFAULT_USER_WHITELIST_ENABLED,
    leaveUnauthorizedGuilds: typeof item?.leaveUnauthorizedGuilds === "boolean"
      ? item.leaveUnauthorizedGuilds
      : DEFAULT_LEAVE_UNAUTHORIZED_GUILDS,
    whitelistGuildIds: normalizeIdList(item?.whitelistGuildIds || []),
    whitelistUserIds: normalizeIdList(item?.whitelistUserIds || []),
    updatedAt: item?.updatedAt || null
  };
}

function normalizeTitleWatchVideoIds(videoIds, lastVideoId = null) {
  const candidates = [];

  if (lastVideoId) {
    candidates.push(lastVideoId);
  }

  const values = Array.isArray(videoIds) ? videoIds : [videoIds];
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) {
      candidates.push(normalized);
    }
  }

  return [...new Set(candidates)].slice(0, TITLE_WATCH_HISTORY_LIMIT);
}

function sanitizeTitleWatch(item) {
  const lastVideoId = item?.lastVideoId ? String(item.lastVideoId) : null;
  const rawMaxAgeDays = Number(item?.maxAgeDays);
  const maxAgeDays = Number.isFinite(rawMaxAgeDays) && rawMaxAgeDays > 0
    ? Math.floor(rawMaxAgeDays)
    : DEFAULT_TITLE_WATCH_MAX_AGE_DAYS;
  const configuredAt = item?.configuredAt || item?.createdAt || item?.updatedAt || null;
  const stateUpdatedAt = item?.stateUpdatedAt || item?.updatedAt || item?.createdAt || null;

  return {
    keyword: String(item?.keyword || "").trim(),
    channelId: item?.channelId ? String(item.channelId) : null,
    roleId: item?.roleId ? String(item.roleId) : null,
    lastVideoId,
    maxAgeDays,
    configuredAt,
    stateUpdatedAt,
    lastNotificationSignature: item?.lastNotificationSignature ? String(item.lastNotificationSignature) : null,
    lastNotificationAt: item?.lastNotificationAt || null,
    lastDeliveryAttemptSignature: item?.lastDeliveryAttemptSignature ? String(item.lastDeliveryAttemptSignature) : null,
    lastDeliveryAttemptAt: item?.lastDeliveryAttemptAt || null,
    recentVideoIds: normalizeTitleWatchVideoIds(item?.recentVideoIds, lastVideoId),
    createdAt: item?.createdAt || null,
    updatedAt: item?.updatedAt || null
  };
}

function normalizeRecentSeenVideoIds(videoIds, lastVideoId = null, limit = 25) {
  const candidates = [];

  if (lastVideoId) {
    candidates.push(lastVideoId);
  }

  const values = Array.isArray(videoIds) ? videoIds : [videoIds];
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) {
      candidates.push(normalized);
    }
  }

  return [...new Set(candidates)].slice(0, Math.max(1, Number(limit) || 25));
}

let writeQueue = Promise.resolve();

async function ensureDataFile() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(createDefaultData(), null, 2), "utf8");
  }
}

function sanitizeData(data) {
  return {
    dataVersion: DATA_SCHEMA_VERSION,
    globalSettings: {
      accessControl: sanitizeAccessControl(data?.globalSettings?.accessControl),
      logging: sanitizeGlobalLogging(data?.globalSettings?.logging)
    },
    guildSettings: Array.isArray(data?.guildSettings)
      ? data.guildSettings.map((item) => ({
          ...item,
          prefix: item?.prefix || null,
          logChannelId: item?.logChannelId ? String(item.logChannelId) : null,
          logLevel: sanitizeLogLevel(item?.logLevel, DEFAULT_USER_LOG_LEVEL),
          previewOnAdd: typeof item?.previewOnAdd === "boolean" ? item.previewOnAdd : DEFAULT_PREVIEW_ON_ADD,
          titleWatches: Array.isArray(item?.titleWatches)
            ? item.titleWatches.map(sanitizeTitleWatch).filter((watch) => watch.keyword)
            : []
        }))
      : [],
    trackedChannels: Array.isArray(data?.trackedChannels)
      ? data.trackedChannels.map((item) => ({
          ...item,
          youtube: {
            ...item?.youtube,
            title: item?.youtube?.title ? decodeHtmlEntities(item.youtube.title) : null
          },
          lastContentState: item?.lastContentState || null,
          lastNotifiedVideoId: item?.lastNotifiedVideoId || null,
          lastNotifiedContentState: item?.lastNotifiedContentState || null,
          lastNotificationSignature: item?.lastNotificationSignature || null,
          lastNotificationAt: item?.lastNotificationAt || null,
          lastDeliveryAttemptSignature: item?.lastDeliveryAttemptSignature || null,
          lastDeliveryAttemptAt: item?.lastDeliveryAttemptAt || null,
          recentSeenVideoIds: normalizeRecentSeenVideoIds(item?.recentSeenVideoIds, item?.lastVideoId),
          notifications: {
            contentFilter: item?.notifications?.contentFilter || DEFAULT_CONTENT_FILTER,
            embedLayout: normalizeEmbedLayout(item?.notifications?.embedLayout || DEFAULT_EMBED_LAYOUT),
            customMessage: item?.notifications?.customMessage || null,
            titleFilters: normalizeTitleFilters(
              item?.notifications?.titleFilters ?? item?.notifications?.titleFilter ?? []
            )
          }
        }))
      : []
  };
}

function buildGuildSettings(existing, overrides = {}, now = new Date().toISOString()) {
  return {
    guildId: overrides.guildId || existing?.guildId || null,
    prefix: Object.prototype.hasOwnProperty.call(overrides, "prefix")
      ? overrides.prefix
      : (existing?.prefix || null),
    logChannelId: Object.prototype.hasOwnProperty.call(overrides, "logChannelId")
      ? (overrides.logChannelId || null)
      : (existing?.logChannelId || null),
    logLevel: Object.prototype.hasOwnProperty.call(overrides, "logLevel")
      ? sanitizeLogLevel(overrides.logLevel, DEFAULT_USER_LOG_LEVEL)
      : sanitizeLogLevel(existing?.logLevel, DEFAULT_USER_LOG_LEVEL),
    previewOnAdd: Object.prototype.hasOwnProperty.call(overrides, "previewOnAdd")
      ? Boolean(overrides.previewOnAdd)
      : (typeof existing?.previewOnAdd === "boolean" ? existing.previewOnAdd : DEFAULT_PREVIEW_ON_ADD),
    titleWatches: Array.isArray(overrides.titleWatches)
      ? overrides.titleWatches
      : (Array.isArray(existing?.titleWatches) ? existing.titleWatches : []),
    updatedAt: now
  };
}

function buildAccessControl(existing, overrides = {}, now = new Date().toISOString()) {
  const current = sanitizeAccessControl(existing);

  return {
    guildWhitelistEnabled: Object.prototype.hasOwnProperty.call(overrides, "guildWhitelistEnabled")
      ? Boolean(overrides.guildWhitelistEnabled)
      : current.guildWhitelistEnabled,
    userWhitelistEnabled: Object.prototype.hasOwnProperty.call(overrides, "userWhitelistEnabled")
      ? Boolean(overrides.userWhitelistEnabled)
      : current.userWhitelistEnabled,
    leaveUnauthorizedGuilds: Object.prototype.hasOwnProperty.call(overrides, "leaveUnauthorizedGuilds")
      ? Boolean(overrides.leaveUnauthorizedGuilds)
      : current.leaveUnauthorizedGuilds,
    whitelistGuildIds: Object.prototype.hasOwnProperty.call(overrides, "whitelistGuildIds")
      ? normalizeIdList(overrides.whitelistGuildIds || [])
      : current.whitelistGuildIds,
    whitelistUserIds: Object.prototype.hasOwnProperty.call(overrides, "whitelistUserIds")
      ? normalizeIdList(overrides.whitelistUserIds || [])
      : current.whitelistUserIds,
    updatedAt: now
  };
}

function buildGlobalLogging(existing, overrides = {}) {
  const current = sanitizeGlobalLogging(existing);

  return {
    devLogChannelId: Object.prototype.hasOwnProperty.call(overrides, "devLogChannelId")
      ? (overrides.devLogChannelId || null)
      : current.devLogChannelId,
    devLogLevel: Object.prototype.hasOwnProperty.call(overrides, "devLogLevel")
      ? sanitizeLogLevel(overrides.devLogLevel, DEFAULT_DEV_LOG_LEVEL)
      : current.devLogLevel,
    userIncludeErrorStack: Object.prototype.hasOwnProperty.call(overrides, "userIncludeErrorStack")
      ? Boolean(overrides.userIncludeErrorStack)
      : current.userIncludeErrorStack
  };
}

async function readData() {
  await ensureDataFile();

  const raw = await fs.readFile(DATA_FILE, "utf8");
  if (!raw.trim()) {
    const emptyData = createDefaultData();
    await fs.writeFile(DATA_FILE, JSON.stringify(emptyData, null, 2), "utf8");
    return emptyData;
  }

  try {
    const parsed = JSON.parse(raw);
    const migration = migrateData(parsed);
    const sanitized = sanitizeData(migration.data);

    if (migration.changed) {
      await fs.writeFile(DATA_FILE, JSON.stringify(sanitized, null, 2), "utf8");
      logger.info(`Migrasi data.json berhasil: v${migration.fromVersion} -> v${migration.toVersion}.`);
    }

    return sanitized;
  } catch (parseError) {
    const backupFile = `${DATA_FILE}.broken-${Date.now()}.json`;
    await fs.writeFile(backupFile, raw, "utf8");
    logger.warn(`data.json rusak. Backup dibuat ke ${backupFile}`, parseError);

    const emptyData = createDefaultData();
    await fs.writeFile(DATA_FILE, JSON.stringify(emptyData, null, 2), "utf8");
    return emptyData;
  }
}

async function writeData(data) {
  await ensureDataFile();
  const normalized = sanitizeData(data);
  await fs.writeFile(DATA_FILE, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function queueWrite(task) {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
}

function isMatchingIdentifier(item, guildId, identifier) {
  const needle = String(identifier || "").trim().toLowerCase();
  return (
    item?.discord?.guildId === guildId &&
    (
      item?.youtube?.username?.toLowerCase() === needle ||
      item?.youtube?.channelId?.toLowerCase() === needle
    )
  );
}

async function getAllTrackedChannels() {
  const data = await readData();
  return data.trackedChannels;
}

function getCurrentDataSchemaVersion() {
  return DATA_SCHEMA_VERSION;
}

async function getGlobalAccessControl() {
  const data = await readData();
  return sanitizeAccessControl(data.globalSettings?.accessControl);
}

async function getGlobalLoggingSettings() {
  const data = await readData();
  return sanitizeGlobalLogging(data.globalSettings?.logging);
}

async function getGuildSettings(guildId) {
  const data = await readData();
  return data.guildSettings.find((item) => item?.guildId === guildId) || null;
}

async function getTrackedChannelsByGuild(guildId) {
  const data = await readData();
  return data.trackedChannels.filter((item) => item?.discord?.guildId === guildId);
}

async function findTrackedChannel(guildId, identifier) {
  const trackedChannels = await getTrackedChannelsByGuild(guildId);
  return trackedChannels.find((item) => isMatchingIdentifier(item, guildId, identifier)) || null;
}

function buildTrackedChannelEntry(existing, payload, now) {
  return {
    youtube: {
      username: payload.youtube.username,
      channelId: payload.youtube.channelId,
      title: payload.youtube.title || existing?.youtube?.title || null
    },
    discord: {
      guildId: payload.discord.guildId,
      channelId: payload.discord.channelId,
      roleId: payload.discord.roleId || null
    },
    notifications: {
      contentFilter: payload.notifications?.contentFilter ?? existing?.notifications?.contentFilter ?? DEFAULT_CONTENT_FILTER,
      embedLayout: normalizeEmbedLayout(
        payload.notifications?.embedLayout
          ?? existing?.notifications?.embedLayout
          ?? DEFAULT_EMBED_LAYOUT
      ),
      customMessage: payload.notifications?.customMessage ?? existing?.notifications?.customMessage ?? null,
      titleFilters: normalizeTitleFilters(
        payload.notifications?.titleFilters
          ?? payload.notifications?.titleFilter
          ?? existing?.notifications?.titleFilters
          ?? existing?.notifications?.titleFilter
          ?? []
      )
    },
    lastVideoId: payload.lastVideoId ?? existing?.lastVideoId ?? null,
    lastVideoUrl: payload.lastVideoUrl ?? existing?.lastVideoUrl ?? null,
    lastPublishedAt: payload.lastPublishedAt ?? existing?.lastPublishedAt ?? null,
    lastContentState: payload.lastContentState ?? existing?.lastContentState ?? null,
    lastNotifiedVideoId: payload.lastNotifiedVideoId ?? existing?.lastNotifiedVideoId ?? null,
    lastNotifiedContentState: payload.lastNotifiedContentState ?? existing?.lastNotifiedContentState ?? null,
    lastNotificationSignature: payload.lastNotificationSignature ?? existing?.lastNotificationSignature ?? null,
    lastNotificationAt: payload.lastNotificationAt ?? existing?.lastNotificationAt ?? null,
    lastDeliveryAttemptSignature: payload.lastDeliveryAttemptSignature ?? existing?.lastDeliveryAttemptSignature ?? null,
    lastDeliveryAttemptAt: payload.lastDeliveryAttemptAt ?? existing?.lastDeliveryAttemptAt ?? null,
    recentSeenVideoIds: normalizeRecentSeenVideoIds(
      payload.recentSeenVideoIds ?? existing?.recentSeenVideoIds ?? [],
      payload.lastVideoId ?? existing?.lastVideoId ?? null
    ),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

async function upsertTrackedChannel(payload) {
  return queueWrite(async () => {
    const data = await readData();
    const now = new Date().toISOString();

    const existingIndex = data.trackedChannels.findIndex((item) => {
      return (
        item?.discord?.guildId === payload.discord.guildId &&
        item?.youtube?.channelId === payload.youtube.channelId
      );
    });

    const existing = existingIndex >= 0 ? data.trackedChannels[existingIndex] : null;
    const nextEntry = buildTrackedChannelEntry(existing, payload, now);

    if (existingIndex >= 0) {
      data.trackedChannels[existingIndex] = nextEntry;
    } else {
      data.trackedChannels.push(nextEntry);
    }

    await writeData(data);
    return {
      entry: nextEntry,
      isNew: existingIndex === -1
    };
  });
}

async function replaceTrackedChannel(guildId, identifier, payload) {
  return queueWrite(async () => {
    const data = await readData();
    const now = new Date().toISOString();
    const existingIndex = data.trackedChannels.findIndex((item) => isMatchingIdentifier(item, guildId, identifier));

    if (existingIndex === -1) {
      return null;
    }

    const existing = data.trackedChannels[existingIndex];
    const nextEntry = buildTrackedChannelEntry(existing, payload, now);

    data.trackedChannels[existingIndex] = nextEntry;
    await writeData(data);

    return {
      entry: nextEntry,
      isNew: false
    };
  });
}

async function removeTrackedChannel(guildId, identifier) {
  return queueWrite(async () => {
    const data = await readData();
    const existingIndex = data.trackedChannels.findIndex((item) => isMatchingIdentifier(item, guildId, identifier));

    if (existingIndex === -1) {
      return null;
    }

    const removedItems = data.trackedChannels.splice(existingIndex, 1);
    await writeData(data);
    return removedItems[0] || null;
  });
}

async function updateLastVideoState(guildId, youtubeChannelId, latestVideo, options = {}) {
  return queueWrite(async () => {
    const data = await readData();
    const item = data.trackedChannels.find((entry) => {
      return entry?.discord?.guildId === guildId && entry?.youtube?.channelId === youtubeChannelId;
    });

    if (!item) {
      return null;
    }

    item.lastVideoId = latestVideo.videoId;
    item.lastVideoUrl = latestVideo.link;
    item.lastPublishedAt = latestVideo.publishedAt || null;

    if (Object.prototype.hasOwnProperty.call(options, "observedContentState")) {
      item.lastContentState = options.observedContentState || null;
    } else if (latestVideo.contentState) {
      item.lastContentState = latestVideo.contentState;
    }

    if (Object.prototype.hasOwnProperty.call(options, "lastNotifiedVideoId")) {
      item.lastNotifiedVideoId = options.lastNotifiedVideoId || null;
    }

    if (Object.prototype.hasOwnProperty.call(options, "lastNotifiedContentState")) {
      item.lastNotifiedContentState = options.lastNotifiedContentState || null;
    }

    if (Object.prototype.hasOwnProperty.call(options, "lastNotificationSignature")) {
      item.lastNotificationSignature = options.lastNotificationSignature || null;
    }

    if (Object.prototype.hasOwnProperty.call(options, "lastNotificationAt")) {
      item.lastNotificationAt = options.lastNotificationAt || null;
    }

    if (Object.prototype.hasOwnProperty.call(options, "lastDeliveryAttemptSignature")) {
      item.lastDeliveryAttemptSignature = options.lastDeliveryAttemptSignature || null;
    }

    if (Object.prototype.hasOwnProperty.call(options, "lastDeliveryAttemptAt")) {
      item.lastDeliveryAttemptAt = options.lastDeliveryAttemptAt || null;
    }

    if (Object.prototype.hasOwnProperty.call(options, "recentSeenVideoIds")) {
      item.recentSeenVideoIds = normalizeRecentSeenVideoIds(
        options.recentSeenVideoIds || [],
        latestVideo.videoId
      );
    } else {
      item.recentSeenVideoIds = normalizeRecentSeenVideoIds(
        item.recentSeenVideoIds || [],
        latestVideo.videoId
      );
    }

    item.updatedAt = new Date().toISOString();

    await writeData(data);
    return item;
  });
}

async function getGuildPrefix(guildId, fallbackPrefix) {
  const guildSettings = await getGuildSettings(guildId);
  return guildSettings?.prefix || fallbackPrefix;
}

async function getGuildPreviewOnAdd(guildId, fallbackValue = DEFAULT_PREVIEW_ON_ADD) {
  const guildSettings = await getGuildSettings(guildId);
  return typeof guildSettings?.previewOnAdd === "boolean" ? guildSettings.previewOnAdd : fallbackValue;
}

async function getGuildLogChannelId(guildId) {
  const guildSettings = await getGuildSettings(guildId);
  return guildSettings?.logChannelId || null;
}

async function getGuildLogLevel(guildId) {
  const guildSettings = await getGuildSettings(guildId);
  return sanitizeLogLevel(guildSettings?.logLevel, DEFAULT_USER_LOG_LEVEL);
}

async function getTitleWatchesByGuild(guildId) {
  const guildSettings = await getGuildSettings(guildId);
  return guildSettings?.titleWatches || [];
}

async function setGuildPrefix(guildId, prefix) {
  return queueWrite(async () => {
    const data = await readData();
    const now = new Date().toISOString();
    const existingIndex = data.guildSettings.findIndex((item) => item?.guildId === guildId);
    const existing = existingIndex >= 0 ? data.guildSettings[existingIndex] : null;
    const nextSettings = buildGuildSettings(existing, { guildId, prefix }, now);

    if (existingIndex >= 0) {
      data.guildSettings[existingIndex] = nextSettings;
    } else {
      data.guildSettings.push(nextSettings);
    }

    await writeData(data);
    return nextSettings;
  });
}

async function setGuildPreviewOnAdd(guildId, previewOnAdd) {
  return queueWrite(async () => {
    const data = await readData();
    const now = new Date().toISOString();
    const existingIndex = data.guildSettings.findIndex((item) => item?.guildId === guildId);
    const existing = existingIndex >= 0 ? data.guildSettings[existingIndex] : null;
    const nextSettings = buildGuildSettings(existing, { guildId, previewOnAdd }, now);

    if (existingIndex >= 0) {
      data.guildSettings[existingIndex] = nextSettings;
    } else {
      data.guildSettings.push(nextSettings);
    }

    await writeData(data);
    return nextSettings;
  });
}

async function setGuildLogChannelId(guildId, logChannelId) {
  return queueWrite(async () => {
    const data = await readData();
    const now = new Date().toISOString();
    const existingIndex = data.guildSettings.findIndex((item) => item?.guildId === guildId);
    const existing = existingIndex >= 0 ? data.guildSettings[existingIndex] : null;
    const nextSettings = buildGuildSettings(existing, { guildId, logChannelId }, now);

    if (existingIndex >= 0) {
      data.guildSettings[existingIndex] = nextSettings;
    } else {
      data.guildSettings.push(nextSettings);
    }

    await writeData(data);
    return nextSettings;
  });
}

async function setGlobalAccessControl(overrides = {}) {
  return queueWrite(async () => {
    const data = await readData();
    const now = new Date().toISOString();
    const existing = sanitizeAccessControl(data.globalSettings?.accessControl);
    const nextAccessControl = buildAccessControl(existing, overrides, now);

    data.globalSettings = {
      ...(data.globalSettings || {}),
      accessControl: nextAccessControl
    };

    await writeData(data);
    return nextAccessControl;
  });
}

async function setGlobalLoggingSettings(overrides = {}) {
  return queueWrite(async () => {
    const data = await readData();
    const existing = sanitizeGlobalLogging(data.globalSettings?.logging);
    const nextLogging = buildGlobalLogging(existing, overrides);

    data.globalSettings = {
      ...(data.globalSettings || {}),
      logging: nextLogging
    };

    await writeData(data);
    return nextLogging;
  });
}

async function addGlobalWhitelistGuildId(guildId) {
  const current = await getGlobalAccessControl();
  return setGlobalAccessControl({
    whitelistGuildIds: [...current.whitelistGuildIds, guildId]
  });
}

async function removeGlobalWhitelistGuildId(guildId) {
  const current = await getGlobalAccessControl();
  return setGlobalAccessControl({
    whitelistGuildIds: current.whitelistGuildIds.filter((item) => item !== String(guildId))
  });
}

async function addGlobalWhitelistUserId(userId) {
  const current = await getGlobalAccessControl();
  return setGlobalAccessControl({
    whitelistUserIds: [...current.whitelistUserIds, userId]
  });
}

async function removeGlobalWhitelistUserId(userId) {
  const current = await getGlobalAccessControl();
  return setGlobalAccessControl({
    whitelistUserIds: current.whitelistUserIds.filter((item) => item !== String(userId))
  });
}

async function upsertTitleWatch(guildId, payload) {
  return queueWrite(async () => {
    const data = await readData();
    const now = new Date().toISOString();
    const guildIndex = data.guildSettings.findIndex((item) => item?.guildId === guildId);
    const guildSettings = guildIndex >= 0
      ? data.guildSettings[guildIndex]
      : buildGuildSettings(null, { guildId, titleWatches: [] }, now);

    const titleWatches = Array.isArray(guildSettings.titleWatches) ? guildSettings.titleWatches : [];
    const normalizedKeyword = String(payload.keyword || "").trim();
    const watchIndex = titleWatches.findIndex((item) => item.keyword.toLowerCase() === normalizedKeyword.toLowerCase());
    const existing = watchIndex >= 0 ? titleWatches[watchIndex] : null;
    const nextLastVideoId = payload.lastVideoId ?? existing?.lastVideoId ?? null;
    const rawMaxAgeDays = payload.maxAgeDays ?? existing?.maxAgeDays ?? DEFAULT_TITLE_WATCH_MAX_AGE_DAYS;
    const nextMaxAgeDays = Number.isFinite(Number(rawMaxAgeDays)) && Number(rawMaxAgeDays) > 0
      ? Math.floor(Number(rawMaxAgeDays))
      : DEFAULT_TITLE_WATCH_MAX_AGE_DAYS;
    const nextWatch = {
      keyword: normalizedKeyword,
      channelId: payload.channelId || existing?.channelId || null,
      roleId: payload.roleId ?? existing?.roleId ?? null,
      lastVideoId: nextLastVideoId,
      maxAgeDays: nextMaxAgeDays,
      configuredAt: now,
      stateUpdatedAt: payload.stateUpdatedAt ?? existing?.stateUpdatedAt ?? now,
      lastNotificationSignature: payload.lastNotificationSignature ?? existing?.lastNotificationSignature ?? null,
      lastNotificationAt: payload.lastNotificationAt ?? existing?.lastNotificationAt ?? null,
      lastDeliveryAttemptSignature: payload.lastDeliveryAttemptSignature ?? existing?.lastDeliveryAttemptSignature ?? null,
      lastDeliveryAttemptAt: payload.lastDeliveryAttemptAt ?? existing?.lastDeliveryAttemptAt ?? null,
      recentVideoIds: normalizeTitleWatchVideoIds(
        payload.recentVideoIds ?? existing?.recentVideoIds ?? [],
        nextLastVideoId
      ),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    if (watchIndex >= 0) {
      titleWatches[watchIndex] = nextWatch;
    } else {
      titleWatches.push(nextWatch);
    }

    guildSettings.titleWatches = titleWatches;
    guildSettings.updatedAt = now;

    if (guildIndex >= 0) {
      data.guildSettings[guildIndex] = guildSettings;
    } else {
      data.guildSettings.push(guildSettings);
    }

    await writeData(data);
    return {
      watch: nextWatch,
      isNew: watchIndex === -1
    };
  });
}

async function removeTitleWatch(guildId, keyword) {
  return queueWrite(async () => {
    const data = await readData();
    const guildSettings = data.guildSettings.find((item) => item?.guildId === guildId);

    if (!guildSettings?.titleWatches?.length) {
      return null;
    }

    const watchIndex = guildSettings.titleWatches.findIndex((item) => item.keyword.toLowerCase() === String(keyword || "").trim().toLowerCase());
    if (watchIndex === -1) {
      return null;
    }

    const removedItems = guildSettings.titleWatches.splice(watchIndex, 1);
    guildSettings.updatedAt = new Date().toISOString();
    await writeData(data);
    return removedItems[0] || null;
  });
}

async function updateTitleWatchLastVideo(guildId, keyword, videoId, recentVideoIds = []) {
  return queueWrite(async () => {
    const data = await readData();
    const guildSettings = data.guildSettings.find((item) => item?.guildId === guildId);
    const watch = guildSettings?.titleWatches?.find((item) => item.keyword.toLowerCase() === String(keyword || "").trim().toLowerCase());

    if (!watch) {
      return null;
    }

    watch.recentVideoIds = normalizeTitleWatchVideoIds(
      [
        videoId,
        ...(Array.isArray(recentVideoIds) ? recentVideoIds : [recentVideoIds]),
        ...(watch.recentVideoIds || [])
      ],
      null
    );
    watch.lastVideoId = watch.recentVideoIds[0] || null;
    watch.stateUpdatedAt = new Date().toISOString();
    watch.updatedAt = new Date().toISOString();
    guildSettings.updatedAt = watch.stateUpdatedAt;
    await writeData(data);
    return watch;
  });
}

async function updateTitleWatchNotificationState(guildId, keyword, updates = {}) {
  return queueWrite(async () => {
    const data = await readData();
    const guildSettings = data.guildSettings.find((item) => item?.guildId === guildId);
    const watch = guildSettings?.titleWatches?.find((item) => item.keyword.toLowerCase() === String(keyword || "").trim().toLowerCase());

    if (!watch) {
      return null;
    }

    if (Object.prototype.hasOwnProperty.call(updates, "lastNotificationSignature")) {
      watch.lastNotificationSignature = updates.lastNotificationSignature || null;
    }

    if (Object.prototype.hasOwnProperty.call(updates, "lastNotificationAt")) {
      watch.lastNotificationAt = updates.lastNotificationAt || null;
    }

    if (Object.prototype.hasOwnProperty.call(updates, "lastDeliveryAttemptSignature")) {
      watch.lastDeliveryAttemptSignature = updates.lastDeliveryAttemptSignature || null;
    }

    if (Object.prototype.hasOwnProperty.call(updates, "lastDeliveryAttemptAt")) {
      watch.lastDeliveryAttemptAt = updates.lastDeliveryAttemptAt || null;
    }

    watch.stateUpdatedAt = new Date().toISOString();
    watch.updatedAt = watch.stateUpdatedAt;
    guildSettings.updatedAt = watch.stateUpdatedAt;
    await writeData(data);
    return watch;
  });
}

module.exports = {
  addGlobalWhitelistGuildId,
  addGlobalWhitelistUserId,
  ensureDataFile,
  findTrackedChannel,
  getCurrentDataSchemaVersion,
  getAllTrackedChannels,
  getGlobalAccessControl,
  getGlobalLoggingSettings,
  getGuildLogChannelId,
  getGuildLogLevel,
  getGuildPrefix,
  getGuildPreviewOnAdd,
  getGuildSettings,
  getTitleWatchesByGuild,
  getTrackedChannelsByGuild,
  readData,
  replaceTrackedChannel,
  removeGlobalWhitelistGuildId,
  removeGlobalWhitelistUserId,
  removeTrackedChannel,
  removeTitleWatch,
  setGlobalAccessControl,
  setGlobalLoggingSettings,
  setGuildLogChannelId,
  setGuildPrefix,
  setGuildPreviewOnAdd,
  upsertTitleWatch,
  updateTitleWatchNotificationState,
  updateTitleWatchLastVideo,
  upsertTrackedChannel,
  updateLastVideoState,
  writeData,
  __private: {
    migrateData,
    normalizeDataVersion
  }
};
