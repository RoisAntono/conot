"use strict";

const { TOPICS } = require("../events/eventBus");

class ConfigService {
  constructor(options) {
    this.repository = options.repository;
    this.eventBus = options.eventBus;
  }

  getGuildSettings(guildId) {
    return this.repository.getGuildSettings(guildId);
  }

  async patchGuildSettings(guildId, patch, actorUserId) {
    await this.repository.upsertGuildSettings(guildId, patch, actorUserId);
    const settings = await this.repository.getGuildSettings(guildId);
    this.eventBus.emitTopic(TOPICS.CONFIG_UPDATED, { guildId, actorUserId, patch });
    return settings;
  }

  listTrackers(guildId) {
    return this.repository.listTrackers(guildId);
  }

  async createTracker(guildId, payload, actorUserId) {
    const tracker = await this.repository.createTracker(guildId, payload, actorUserId);
    this.eventBus.emitTopic(TOPICS.TRACKER_CREATED, { guildId, trackerId: tracker.id, actorUserId });
    this.eventBus.emitTopic(TOPICS.CONFIG_UPDATED, { guildId, actorUserId });
    return tracker;
  }

  async updateTracker(guildId, trackerId, patch, actorUserId) {
    const tracker = await this.repository.updateTracker(guildId, trackerId, patch, actorUserId);
    if (tracker) {
      this.eventBus.emitTopic(TOPICS.TRACKER_UPDATED, { guildId, trackerId, actorUserId });
      this.eventBus.emitTopic(TOPICS.CONFIG_UPDATED, { guildId, actorUserId });
    }
    return tracker;
  }

  async deleteTracker(guildId, trackerId, actorUserId) {
    const tracker = await this.repository.deleteTracker(guildId, trackerId, actorUserId);
    if (tracker) {
      this.eventBus.emitTopic(TOPICS.TRACKER_DELETED, { guildId, trackerId, actorUserId });
      this.eventBus.emitTopic(TOPICS.CONFIG_UPDATED, { guildId, actorUserId });
    }
    return tracker;
  }

  listTitleWatches(guildId) {
    return this.repository.listTitleWatches(guildId);
  }

  async createTitleWatch(guildId, payload, actorUserId) {
    const watch = await this.repository.createTitleWatch(guildId, payload, actorUserId);
    this.eventBus.emitTopic(TOPICS.TITLE_WATCH_CREATED, { guildId, watchId: watch.id, actorUserId });
    this.eventBus.emitTopic(TOPICS.CONFIG_UPDATED, { guildId, actorUserId });
    return watch;
  }

  async updateTitleWatch(guildId, watchId, patch, actorUserId) {
    const watch = await this.repository.updateTitleWatch(guildId, watchId, patch, actorUserId);
    if (watch) {
      this.eventBus.emitTopic(TOPICS.TITLE_WATCH_UPDATED, { guildId, watchId, actorUserId });
      this.eventBus.emitTopic(TOPICS.CONFIG_UPDATED, { guildId, actorUserId });
    }
    return watch;
  }

  async deleteTitleWatch(guildId, watchId, actorUserId) {
    const watch = await this.repository.deleteTitleWatch(guildId, watchId, actorUserId);
    if (watch) {
      this.eventBus.emitTopic(TOPICS.TITLE_WATCH_DELETED, { guildId, watchId, actorUserId });
      this.eventBus.emitTopic(TOPICS.CONFIG_UPDATED, { guildId, actorUserId });
    }
    return watch;
  }

  appendGuildLog(guildId, payload) {
    return this.repository.appendGuildLog(guildId, payload);
  }

  listGuildLogs(guildId, query) {
    return this.repository.listGuildLogs(guildId, query);
  }

  listAuditLogs(guildId, query) {
    return this.repository.listAuditLogs(guildId, query);
  }

  listNotificationHistory(guildId, query) {
    return this.repository.listNotificationHistory(guildId, query);
  }
}

module.exports = {
  ConfigService
};
