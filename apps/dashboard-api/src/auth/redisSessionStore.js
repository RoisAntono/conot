"use strict";

const { randomUUID } = require("node:crypto");

function now() {
  return Date.now();
}

class RedisSessionStore {
  constructor(options = {}) {
    this.ttlMs = options.ttlMs || 1000 * 60 * 60 * 8;
    this.redisUrl = String(options.redisUrl || "").trim();
    this.keyPrefix = String(options.keyPrefix || "conot:dashboard").trim();
    this.client = null;
    this.connecting = null;
  }

  getSessionKey(id) {
    return `${this.keyPrefix}:session:${id}`;
  }

  getStateKey(token) {
    return `${this.keyPrefix}:state:${token}`;
  }

  async ensureClient() {
    if (this.client?.isOpen) {
      return this.client;
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = (async () => {
      const { createClient } = require("redis");
      const client = createClient({
        url: this.redisUrl
      });

      client.on("error", (error) => {
        console.warn(`[dashboard-api] redis session error: ${error.message}`);
      });

      await client.connect();
      this.client = client;
      return client;
    })().finally(() => {
      this.connecting = null;
    });

    return this.connecting;
  }

  async createStateToken(context = {}) {
    const client = await this.ensureClient();
    const token = randomUUID();
    const stateKey = this.getStateKey(token);

    await client.set(
      stateKey,
      JSON.stringify({
        context,
        expiresAt: now() + 1000 * 60 * 10
      }),
      {
        EX: 600
      }
    );

    return token;
  }

  async consumeStateToken(token) {
    if (!token) {
      return null;
    }

    const client = await this.ensureClient();
    const stateKey = this.getStateKey(token);

    let raw = null;
    if (typeof client.getDel === "function") {
      raw = await client.getDel(stateKey);
    } else {
      raw = await client.get(stateKey);
      if (raw) {
        await client.del(stateKey);
      }
    }

    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.expiresAt < now()) {
        return null;
      }
      return parsed.context || null;
    } catch {
      return null;
    }
  }

  async createSession(sessionData) {
    const client = await this.ensureClient();
    const id = randomUUID();
    const record = {
      ...sessionData,
      issuedAt: now(),
      expiresAt: now() + this.ttlMs
    };

    await client.set(this.getSessionKey(id), JSON.stringify(record), {
      PX: this.ttlMs
    });

    return id;
  }

  async getSession(sessionId) {
    if (!sessionId) {
      return null;
    }

    const client = await this.ensureClient();
    const key = this.getSessionKey(sessionId);
    const raw = await client.get(key);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.expiresAt < now()) {
        await client.del(key);
        return null;
      }
      return parsed;
    } catch {
      await client.del(key);
      return null;
    }
  }

  async touchSession(sessionId) {
    const client = await this.ensureClient();
    const key = this.getSessionKey(sessionId);
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const refreshed = {
      ...session,
      expiresAt: now() + this.ttlMs
    };
    await client.set(key, JSON.stringify(refreshed), {
      PX: this.ttlMs
    });
    return refreshed;
  }

  async destroySession(sessionId) {
    if (!sessionId) {
      return;
    }

    const client = await this.ensureClient();
    await client.del(this.getSessionKey(sessionId));
  }
}

module.exports = {
  RedisSessionStore
};
