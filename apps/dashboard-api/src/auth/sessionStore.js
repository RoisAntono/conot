"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function now() {
  return Date.now();
}

class SessionStore {
  constructor(options = {}) {
    this.sessions = new Map();
    this.stateTokens = new Map();
    this.ttlMs = options.ttlMs || 1000 * 60 * 60 * 8;
    this.persistFilePath = options.persistFilePath || "";
    this.flushTimer = null;
    this.loadPersistedSessions();
  }

  createStateToken(context = {}) {
    const token = randomUUID();
    this.stateTokens.set(token, {
      context,
      expiresAt: now() + 1000 * 60 * 10
    });
    return token;
  }

  consumeStateToken(token) {
    const state = this.stateTokens.get(token);
    this.stateTokens.delete(token);
    if (!state || state.expiresAt < now()) {
      return null;
    }
    return state.context;
  }

  createSession(sessionData) {
    const id = randomUUID();
    const record = {
      ...sessionData,
      issuedAt: now(),
      expiresAt: now() + this.ttlMs
    };
    this.sessions.set(id, record);
    this.schedulePersist();
    return id;
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    if (session.expiresAt < now()) {
      this.sessions.delete(sessionId);
      this.schedulePersist();
      return null;
    }
    return session;
  }

  touchSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    session.expiresAt = now() + this.ttlMs;
    this.sessions.set(sessionId, session);
    this.schedulePersist();
    return session;
  }

  destroySession(sessionId) {
    if (!sessionId) {
      return;
    }
    this.sessions.delete(sessionId);
    this.schedulePersist();
  }

  loadPersistedSessions() {
    if (!this.persistFilePath) {
      return;
    }

    try {
      if (!fs.existsSync(this.persistFilePath)) {
        return;
      }

      const raw = fs.readFileSync(this.persistFilePath, "utf8");
      const payload = JSON.parse(raw || "{}");
      const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
      for (const item of sessions) {
        if (item?.id && item?.session?.expiresAt > now()) {
          this.sessions.set(item.id, item.session);
        }
      }
    } catch (error) {
      console.warn(`[dashboard-api] gagal load persisted session: ${error.message}`);
    }
  }

  schedulePersist() {
    if (!this.persistFilePath) {
      return;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(() => this.persistNow(), 120);
    if (typeof this.flushTimer.unref === "function") {
      this.flushTimer.unref();
    }
  }

  persistNow() {
    if (!this.persistFilePath) {
      return;
    }

    try {
      const payload = {
        sessions: Array.from(this.sessions.entries()).map(([id, session]) => ({ id, session }))
      };
      fs.mkdirSync(path.dirname(this.persistFilePath), { recursive: true });
      fs.writeFileSync(this.persistFilePath, JSON.stringify(payload, null, 2), "utf8");
    } catch (error) {
      console.warn(`[dashboard-api] gagal persist session: ${error.message}`);
    }
  }
}

module.exports = {
  SessionStore
};
