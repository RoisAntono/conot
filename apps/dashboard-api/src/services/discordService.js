"use strict";

const {
  fetchDiscordBotGuilds,
  fetchDiscordGuildChannels,
  fetchDiscordGuildRoles,
  resolveDiscordOAuthProfile
} = require("../auth/discordAuth");

class DiscordService {
  constructor(options = {}) {
    this.env = options.env;
    this.repository = options.repository || null;
    this.botGuildCache = {
      expiresAt: 0,
      info: null
    };
    this.guildChannelCache = new Map();
    this.guildRoleCache = new Map();
  }

  async resolveOAuthProfile(code) {
    return resolveDiscordOAuthProfile(this.env, code);
  }

  async getConfiguredGuildIds() {
    if (!this.repository) {
      return new Set();
    }

    try {
      const data = await this.repository.read();
      const ids = new Set();

      for (const setting of data.guildSettings || []) {
        if (setting?.guildId) {
          ids.add(String(setting.guildId));
        }
      }

      for (const tracker of data.trackedChannels || []) {
        if (tracker?.discord?.guildId) {
          ids.add(String(tracker.discord.guildId));
        }
      }

      return ids;
    } catch (error) {
      console.warn(`[dashboard-api] gagal membaca configured guilds: ${error.message}`);
      return new Set();
    }
  }

  async getBotGuildInfo() {
    const now = Date.now();
    if (this.botGuildCache.info && this.botGuildCache.expiresAt > now) {
      return this.botGuildCache.info;
    }

    const configuredGuildIds = await this.getConfiguredGuildIds();

    if (!this.env.discordBotToken) {
      const info = configuredGuildIds.size
        ? {
            ids: configuredGuildIds,
            guildMap: new Map(),
            source: "config_fallback_no_bot_token",
            enforceJoinFilter: true
          }
        : {
            ids: null,
            guildMap: new Map(),
            source: "no_bot_token_no_fallback",
            enforceJoinFilter: false
          };
      this.botGuildCache = {
        info,
        expiresAt: now + this.env.discordBotGuildCacheMs
      };
      return info;
    }

    try {
      const guilds = await fetchDiscordBotGuilds(this.env.discordBotToken, this.env);
      const ids = new Set((guilds || []).map((guild) => String(guild.id)));
      const guildMap = new Map(
        (guilds || []).map((guild) => [
          String(guild.id),
          {
            id: String(guild.id),
            name: guild.name || null,
            icon: guild.icon || null
          }
        ])
      );

      const info = ids.size
        ? {
            ids,
            guildMap,
            source: "discord_api",
            enforceJoinFilter: true
          }
        : configuredGuildIds.size
          ? {
              ids: configuredGuildIds,
              guildMap: new Map(),
              source: "config_fallback_api_empty",
              enforceJoinFilter: true
            }
          : {
              ids: null,
              guildMap: new Map(),
              source: "discord_api_empty_no_fallback",
              enforceJoinFilter: false
            };

      this.botGuildCache = {
        info,
        expiresAt: now + this.env.discordBotGuildCacheMs
      };
      return info;
    } catch (error) {
      console.warn(`[dashboard-api] gagal memuat guild bot: ${error.message}`);
      const info = configuredGuildIds.size
        ? {
            ids: configuredGuildIds,
            guildMap: new Map(),
            source: "config_fallback_api_error",
            enforceJoinFilter: true
          }
        : {
            ids: null,
            guildMap: new Map(),
            source: "discord_api_error_no_fallback",
            enforceJoinFilter: false
          };

      this.botGuildCache = {
        info,
        expiresAt: now + this.env.discordBotGuildCacheMs
      };
      return info;
    }
  }

  async getBotGuildIds() {
    const info = await this.getBotGuildInfo();
    return info.ids;
  }

  async getBotTextChannels(guildId) {
    const normalizedGuildId = String(guildId || "").trim();
    if (!normalizedGuildId || !this.env.discordBotToken) {
      return [];
    }

    const now = Date.now();
    const cached = this.guildChannelCache.get(normalizedGuildId);
    if (cached && cached.expiresAt > now) {
      return cached.channels;
    }

    try {
      const channels = await fetchDiscordGuildChannels(
        this.env.discordBotToken,
        normalizedGuildId,
        this.env
      );
      const textChannels = (channels || [])
        .filter((item) => item && [0, 5].includes(Number(item.type)))
        .map((item) => ({
          id: String(item.id),
          name: item.name || `channel-${String(item.id).slice(-4)}`,
          type: Number(item.type),
          position: Number.isFinite(item.position) ? Number(item.position) : 0,
          parentId: item.parent_id ? String(item.parent_id) : null
        }))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

      this.guildChannelCache.set(normalizedGuildId, {
        expiresAt: now + this.env.discordBotGuildCacheMs,
        channels: textChannels
      });
      return textChannels;
    } catch (error) {
      console.warn(
        `[dashboard-api] gagal memuat channel guild ${normalizedGuildId}: ${error.message}`
      );
      this.guildChannelCache.set(normalizedGuildId, {
        expiresAt: now + Math.min(this.env.discordBotGuildCacheMs, 10_000),
        channels: []
      });
      return [];
    }
  }

  async getBotRoles(guildId) {
    const normalizedGuildId = String(guildId || "").trim();
    if (!normalizedGuildId || !this.env.discordBotToken) {
      return [];
    }

    const now = Date.now();
    const cached = this.guildRoleCache.get(normalizedGuildId);
    if (cached && cached.expiresAt > now) {
      return cached.roles;
    }

    try {
      const roles = await fetchDiscordGuildRoles(
        this.env.discordBotToken,
        normalizedGuildId,
        this.env
      );
      const mappedRoles = (roles || [])
        .filter((item) => item && String(item.name || "") !== "@everyone")
        .map((item) => ({
          id: String(item.id),
          name: item.name || `role-${String(item.id).slice(-4)}`,
          color: Number.isFinite(item.color) ? item.color : 0,
          position: Number.isFinite(item.position) ? Number(item.position) : 0,
          mentionable: Boolean(item.mentionable)
        }))
        .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name));

      this.guildRoleCache.set(normalizedGuildId, {
        expiresAt: now + this.env.discordBotGuildCacheMs,
        roles: mappedRoles
      });
      return mappedRoles;
    } catch (error) {
      console.warn(
        `[dashboard-api] gagal memuat role guild ${normalizedGuildId}: ${error.message}`
      );
      this.guildRoleCache.set(normalizedGuildId, {
        expiresAt: now + Math.min(this.env.discordBotGuildCacheMs, 10_000),
        roles: []
      });
      return [];
    }
  }
}

module.exports = {
  DiscordService
};
