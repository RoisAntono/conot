"use strict";

const { EventEmitter } = require("node:events");

const TOPICS = Object.freeze({
  CONFIG_UPDATED: "config.updated",
  TRACKER_CREATED: "tracker.created",
  TRACKER_UPDATED: "tracker.updated",
  TRACKER_DELETED: "tracker.deleted",
  TITLE_WATCH_CREATED: "titlewatch.created",
  TITLE_WATCH_UPDATED: "titlewatch.updated",
  TITLE_WATCH_DELETED: "titlewatch.deleted"
});

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.sequence = 0;
    this.recentEvents = [];
    this.waiters = [];
    this.maxRecentEvents = 200;
  }

  emitTopic(topic, payload) {
    const event = {
      seq: ++this.sequence,
      topic,
      emittedAt: new Date().toISOString(),
      payload: payload || {}
    };

    this.recentEvents.push(event);
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents.shift();
    }

    if (this.waiters.length) {
      const waiters = this.waiters.splice(0);
      for (const waiter of waiters) {
        waiter.resolve(event);
      }
    }

    this.emit(topic, event);
  }

  findNextEvent(afterSeq) {
    return this.recentEvents.find((event) => event.seq > afterSeq) || null;
  }

  getLatestSequence() {
    return this.sequence;
  }

  waitForNextEvent(afterSeq, timeoutMs = 25_000) {
    const immediate = this.findNextEvent(afterSeq);
    if (immediate) {
      return Promise.resolve(immediate);
    }

    return new Promise((resolve) => {
      const waiter = { resolve: null };
      const timeout = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) {
          this.waiters.splice(index, 1);
        }
        resolve(null);
      }, Math.max(1_000, Math.min(30_000, Number(timeoutMs) || 25_000)));

      waiter.resolve = (event) => {
        clearTimeout(timeout);
        resolve(event || null);
      };

      this.waiters.push(waiter);
    });
  }
}

module.exports = {
  TOPICS,
  EventBus
};
