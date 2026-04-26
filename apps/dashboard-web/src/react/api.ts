import type {
  ApiErrorPayload,
  AuditEntry,
  DiscordChannel,
  DiscordRole,
  Guild,
  Health,
  LogEntry,
  NotificationEntry,
  Permission,
  Session,
  Settings,
  TitleWatch,
  Tracker,
  YoutubeResolveResult
} from "./types";

type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

export class ApiError extends Error {
  status: number;
  code: string;
  payload: ApiErrorPayload | null;

  constructor(message: string, status: number, code: string, payload: ApiErrorPayload | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export class ApiClient {
  private baseUrl: string;
  private csrfToken = "";

  constructor(baseUrl: string) {
    this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
  }

  setCsrfToken(token: string | undefined | null) {
    this.csrfToken = token || "";
  }

  loginUrl(returnTo = `${window.location.origin}/dashboard`) {
    const query = new URLSearchParams({
      redirect: "true",
      return_to: returnTo
    });
    return `${this.baseUrl}/v1/auth/discord/login?${query.toString()}`;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method || "GET";
    const headers = { ...(options.headers || {}) };
    if (options.body != null) {
      headers["content-type"] = "application/json";
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(method) && this.csrfToken) {
      headers["x-csrf-token"] = this.csrfToken;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      credentials: "include",
      body: options.body != null ? JSON.stringify(options.body) : undefined
    });
    const payload = (await response.json().catch(() => null)) as ApiSuccess<T> | ApiErrorPayload | null;

    if (!response.ok || !payload || payload.ok !== true) {
      const errorPayload = payload && payload.ok === false ? payload : null;
      throw new ApiError(
        errorPayload?.error?.message || `HTTP ${response.status}`,
        response.status,
        errorPayload?.error?.code || "HTTP_ERROR",
        errorPayload
      );
    }

    return payload.data;
  }

  async download(path: string, fallbackName: string) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      credentials: "include"
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
      throw new ApiError(
        payload?.error?.message || `HTTP ${response.status}`,
        response.status,
        payload?.error?.code || "HTTP_ERROR",
        payload
      );
    }

    const blob = await response.blob();
    const filename = parseFilename(response.headers.get("content-disposition"), fallbackName);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  me() {
    return this.request<Session>("/v1/auth/me");
  }

  logout() {
    return this.request<{ loggedOut: boolean }>("/v1/auth/logout", { method: "POST" });
  }

  guilds() {
    return this.request<Guild[]>("/v1/guilds");
  }

  permissions(guildId: string) {
    return this.request<Permission>(`/v1/guilds/${encodeURIComponent(guildId)}/permissions`);
  }

  channels(guildId: string) {
    return this.request<{ guildId: string; channels: DiscordChannel[] }>(
      `/v1/guilds/${encodeURIComponent(guildId)}/discord/channels`
    );
  }

  roles(guildId: string) {
    return this.request<{ guildId: string; roles: DiscordRole[] }>(
      `/v1/guilds/${encodeURIComponent(guildId)}/discord/roles`
    );
  }

  trackers(guildId: string) {
    return this.request<Tracker[]>(`/v1/guilds/${encodeURIComponent(guildId)}/trackers`);
  }

  titleWatches(guildId: string) {
    return this.request<TitleWatch[]>(`/v1/guilds/${encodeURIComponent(guildId)}/title-watches`);
  }

  settings(guildId: string) {
    return this.request<Settings | null>(`/v1/guilds/${encodeURIComponent(guildId)}/settings`);
  }

  health(guildId: string) {
    return this.request<Health>(`/v1/guilds/${encodeURIComponent(guildId)}/health`);
  }

  logs(guildId: string, query = "") {
    return this.request<LogEntry[]>(`/v1/guilds/${encodeURIComponent(guildId)}/logs${query}`);
  }

  notifications(guildId: string, query = "") {
    return this.request<NotificationEntry[]>(
      `/v1/guilds/${encodeURIComponent(guildId)}/notifications${query}`
    );
  }

  auditLogs(guildId: string, query = "") {
    return this.request<AuditEntry[]>(`/v1/guilds/${encodeURIComponent(guildId)}/audit-logs${query}`);
  }

  resolveYoutube(guildId: string, source: string) {
    return this.request<YoutubeResolveResult>(`/v1/guilds/${encodeURIComponent(guildId)}/youtube/resolve`, {
      method: "POST",
      body: { source }
    });
  }
}

function parseFilename(value: string | null, fallback: string) {
  const match = String(value || "").match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

export const api = new ApiClient(__CONOT_API_BASE__ || "http://localhost:4310");
