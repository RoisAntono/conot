"use strict";

class ConfigClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || "").replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl || fetch;
    this.sessionCookie = options.sessionCookie || "";
  }

  async request(path, method = "GET", body) {
    if (!this.baseUrl) {
      throw new Error("ConfigClient baseUrl belum di-set.");
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(this.sessionCookie ? { cookie: this.sessionCookie } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      const message = payload?.error?.message || `Request gagal (${response.status}).`;
      throw new Error(message);
    }
    return payload.data;
  }

  getGuildSettings(guildId) {
    return this.request(`/v1/guilds/${guildId}/settings`);
  }

  listTrackers(guildId) {
    return this.request(`/v1/guilds/${guildId}/trackers`);
  }

  listTitleWatches(guildId) {
    return this.request(`/v1/guilds/${guildId}/title-watches`);
  }
}

module.exports = {
  ConfigClient
};
