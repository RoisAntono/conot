import { zodResolver } from "@hookform/resolvers/zod";
import {
  Activity,
  Bell,
  Bot,
  CheckCircle2,
  ClipboardList,
  FileClock,
  Gauge,
  LayoutDashboard,
  LogOut,
  Plus,
  Save,
  Search,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  Circle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";
import { Controller, useForm, type FieldValues, type Path, type UseFormSetError } from "react-hook-form";
import { z } from "zod";
import { ApiError, api } from "./api";
import {
  ActionMenu,
  ActionMenuItem,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  Drawer,
  EmptyState,
  ExportMenu,
  FilterToggle,
  RefreshMeta,
  SelectField,
  Skeleton,
  StatusPill,
  TextAreaField,
  TextField,
  ToastStack,
  ToggleField,
  type Toast
} from "./components";
import {
  contentFilterOptions,
  embedLayoutOptions,
  logLevelOptions,
  normalizeSection,
  sections,
  type SectionKey
} from "./domain";
import type {
  AuditEntry,
  DiscordChannel,
  DiscordRole,
  Guild,
  Health,
  LogEntry,
  NotificationEntry,
  Permission,
  Settings,
  Session,
  TitleWatch,
  Tracker,
  YoutubeResolveResult
} from "./types";
import {
  channelLabel,
  cn,
  formatDateForFilename,
  formatDateTime,
  formatRelativeTime,
  getDiscordAvatarUrl,
  getDiscordGuildIconUrl,
  getFieldErrors,
  getInitial,
  getPresetDateRange,
  getUserName,
  queryFromRecord,
  renderCustomMessageTemplate,
  roleLabel,
  toIsoFromDateInput
} from "./utils";
import "./styles.css";

type RouteState = {
  kind: "home" | "dashboard" | "guild";
  guildId?: string;
  section: SectionKey;
};

type Notify = (tone: Toast["tone"], message: string) => void;

function parseRoute(): RouteState {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "dashboard") {
    return { kind: "home", section: "overview" };
  }
  if (!parts[1]) {
    return { kind: "dashboard", section: "overview" };
  }
  return {
    kind: "guild",
    guildId: parts[1],
    section: normalizeSection(parts[2])
  };
}

function routeForGuild(guildId: string, section: SectionKey) {
  const item = sections.find((entry) => entry.key === section);
  return `/dashboard/${encodeURIComponent(guildId)}${item?.path ? `/${item.path}` : ""}`;
}

function sectionIcon(section: SectionKey) {
  const props = { size: 17, "aria-hidden": true };
  if (section === "overview") return <LayoutDashboard {...props} />;
  if (section === "trackers") return <Bot {...props} />;
  if (section === "title-watches") return <Bell {...props} />;
  if (section === "settings") return <SettingsIcon {...props} />;
  if (section === "health") return <Gauge {...props} />;
  if (section === "notifications") return <Activity {...props} />;
  if (section === "logs") return <ClipboardList {...props} />;
  return <FileClock {...props} />;
}

function BrandMark({ className }: { className?: string }) {
  return (
    <img
      className={cn("brand-mark", className)}
      src="/assets/logo.svg"
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

function BrandWordmark({ className }: { className?: string }) {
  return (
    <img
      className={cn("brand-wordmark", className)}
      src="/assets/logo-conot.svg"
      alt="Conot"
      draggable={false}
    />
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Terjadi kesalahan.";
}

type ReloadOptions = { silent?: boolean };

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: React.DependencyList,
  initial: T
): {
  data: T;
  loading: boolean;
  refreshing: boolean;
  error: string;
  updatedAt: Date | null;
  reload: (options?: ReloadOptions) => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T>>;
} {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const hasLoaded = useRef(false);

  const reload = useCallback(async (options: ReloadOptions = {}) => {
    const silent = options.silent ?? hasLoaded.current;
    const started = performance.now();
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      setData(await loader());
      setUpdatedAt(new Date());
      hasLoaded.current = true;
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      const remaining = 250 - (performance.now() - started);
      if (remaining > 0) await wait(remaining);
      setLoading(false);
      setRefreshing(false);
    }
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, refreshing, error, updatedAt, reload, setData };
}

function useAutoRefresh(
  enabled: boolean,
  reload: (options?: ReloadOptions) => Promise<void>,
  intervalMs: number
) {
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void reload({ silent: true });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs, reload]);
}

export default function App() {
  const [route, setRoute] = useState<RouteState>(() => parseRoute());
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [guildsLoading, setGuildsLoading] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback<Notify>((tone, message) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, "", to);
    setRoute(parseRoute());
  }, []);

  const loadGuilds = useCallback(async () => {
    setGuildsLoading(true);
    try {
      setGuilds(await api.guilds());
    } catch (error) {
      notify("error", `Gagal memuat guild: ${getErrorMessage(error)}`);
    } finally {
      setGuildsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const me = await api.me();
        if (!active) return;
        api.setCsrfToken(me.csrfToken);
        setSession(me);
        setAuthChecked(true);
        await loadGuilds();
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          setSession(null);
          setAuthChecked(true);
          return;
        }
        setAuthChecked(true);
        notify("error", `Gagal memuat sesi: ${getErrorMessage(error)}`);
      }
    }
    void bootstrap();
    return () => {
      active = false;
    };
  }, [loadGuilds, notify]);

  useEffect(() => {
    if (authChecked && session && route.kind === "home") {
      navigate("/dashboard");
    }
  }, [authChecked, navigate, route.kind, session]);

  useEffect(() => {
    if (!session) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void loadGuilds();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [loadGuilds, session]);

  if (!authChecked) {
    return (
      <main className="boot-screen">
        <Card>
          <Skeleton rows={4} />
        </Card>
      </main>
    );
  }

  if (!session) {
    return (
      <>
        <AuthPage />
        <ToastStack toasts={toasts} />
      </>
    );
  }

  const currentGuild = route.guildId ? guilds.find((guild) => guild.id === route.guildId) : null;

  const handleLogout = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    try {
      await api.logout();
      api.setCsrfToken("");
      setSession(null);
      setGuilds([]);
      navigate("/");
    } catch (error) {
      setLogoutPending(false);
      notify("error", `Logout gagal: ${getErrorMessage(error)}`);
    }
  };

  return (
    <>
      <AppShell
        session={session}
        guilds={guilds}
        guildsLoading={guildsLoading}
        currentGuild={currentGuild || null}
        route={route}
        navigate={navigate}
        onLogout={handleLogout}
        logoutPending={logoutPending}
      >
        {route.kind === "dashboard" ? (
          <GuildPicker guilds={guilds} loading={guildsLoading} navigate={navigate} />
        ) : (
          <GuildDashboard
            guildId={route.guildId || ""}
            guild={currentGuild || null}
            section={route.section}
            notify={notify}
            navigate={navigate}
          />
        )}
      </AppShell>
      <ToastStack toasts={toasts} />
    </>
  );
}

function AuthPage() {
  return (
    <main className="auth-screen">
      <section className="auth-hero" aria-labelledby="auth-title">
        <div className="auth-copy">
          <div className="auth-brand">
            <BrandWordmark className="auth-brand-wordmark" />
            <span>Operational YouTube bot console</span>
          </div>

          <div className="auth-message">
            <span className="auth-eyebrow">Discord admin dashboard</span>
            <h1 id="auth-title">Conot Trackers</h1>
            <p>
              Kelola YouTube trackers, title watches, settings, logs, notifications, dan audit dari
              satu dashboard yang cepat untuk admin guild.
            </p>
          </div>

          <div className="auth-actions">
            <Button
              type="button"
              className="auth-login-button"
              icon={<ShieldCheck size={17} />}
              onClick={() => window.location.assign(api.loginUrl())}
            >
              Login dengan Discord
            </Button>
            <span className="auth-note">
              <ShieldCheck size={15} aria-hidden="true" />
              MANAGE_GUILD access only
            </span>
          </div>

          <div className="auth-chip-list" aria-label="Dashboard capabilities">
            {["No YouTube API", "Guild admin only", "Audit-ready"].map((item) => (
              <span className="auth-chip" key={item}>
                <CheckCircle2 size={15} aria-hidden="true" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <figure className="auth-preview" aria-label="Dashboard preview">
          <div className="auth-preview-head">
            <span>Dashboard preview</span>
            <span className="auth-preview-status">
              <Circle size={8} fill="currentColor" aria-hidden="true" />
              Auto-refresh ready
            </span>
          </div>
          <div className="auth-preview-frame">
            <img src="/assets/dashboard-mockup.png" alt="Conot dashboard preview" />
          </div>
          <figcaption>Manage trackers without command switching.</figcaption>
        </figure>
      </section>
    </main>
  );
}

function AppShell({
  session,
  guilds,
  guildsLoading,
  currentGuild,
  route,
  children,
  navigate,
  onLogout,
  logoutPending
}: {
  session: Session;
  guilds: Guild[];
  guildsLoading: boolean;
  currentGuild: Guild | null;
  route: RouteState;
  children: React.ReactNode;
  navigate: (path: string) => void;
  onLogout: () => Promise<void>;
  logoutPending: boolean;
}) {
  const avatarUrl = getDiscordAvatarUrl(session.user);

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navigasi utama">
        <button className="brand-row" type="button" onClick={() => navigate("/dashboard")}>
          <BrandMark />
          <span>
            <strong>Conot</strong>
            <small>Dashboard</small>
          </span>
        </button>
        <div className="sidebar-section">
          <span className="sidebar-label">Guild aktif</span>
          <GuildSelect guilds={guilds} currentGuild={currentGuild} navigate={navigate} />
          <span className="sidebar-hint">{guildsLoading ? "Updating guilds..." : `${guilds.length} guild tersedia`}</span>
        </div>
        {currentGuild ? (
          <nav className="sidebar-nav" aria-label="Section guild">
            {sections.map((item) => (
              <button
                key={item.key}
                type="button"
                className={cn("nav-item", route.section === item.key && "nav-item-active")}
                onClick={() => navigate(routeForGuild(currentGuild.id, item.key))}
              >
                {sectionIcon(item.key)}
                {item.label}
              </button>
            ))}
          </nav>
        ) : (
          <nav className="sidebar-nav" aria-label="Section dashboard">
            <button
              type="button"
              className={cn("nav-item", route.kind === "dashboard" && "nav-item-active")}
              onClick={() => navigate("/dashboard")}
            >
              <LayoutDashboard size={17} aria-hidden="true" />
              Pilih Guild
            </button>
          </nav>
        )}
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="mobile-nav">
            <button className="brand-row compact" type="button" onClick={() => navigate("/dashboard")}>
              <BrandMark />
              <strong>Conot</strong>
            </button>
            <GuildSelect guilds={guilds} currentGuild={currentGuild} navigate={navigate} compact />
          </div>
          <div className="section-tabs" aria-label="Navigasi section mobile">
            {currentGuild
              ? sections.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={cn("tab-chip", route.section === item.key && "tab-chip-active")}
                    onClick={() => navigate(routeForGuild(currentGuild.id, item.key))}
                  >
                    {sectionIcon(item.key)}
                    {item.label}
                  </button>
                ))
              : null}
          </div>
          <div className="profile-menu">
            {avatarUrl ? (
              <img src={avatarUrl} alt={getUserName(session.user)} />
            ) : (
              <span>{getInitial(getUserName(session.user))}</span>
            )}
            <div>
              <strong>{getUserName(session.user)}</strong>
              <small>{session.user.handle || session.user.id}</small>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="profile-logout"
              icon={<LogOut size={15} />}
              loading={logoutPending}
              aria-label="Logout"
              onClick={() => void onLogout()}
            >
              Logout
            </Button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

function GuildSelect({
  guilds,
  currentGuild,
  navigate,
  compact
}: {
  guilds: Guild[];
  currentGuild: Guild | null;
  navigate: (path: string) => void;
  compact?: boolean;
}) {
  return (
    <label className={cn("guild-select", compact && "guild-select-compact")}>
      <span className="sr-only">Pilih guild</span>
      <select
        value={currentGuild?.id || ""}
        onChange={(event) => {
          if (event.target.value) navigate(`/dashboard/${encodeURIComponent(event.target.value)}`);
        }}
      >
        <option value="">Pilih guild</option>
        {guilds.map((guild) => (
          <option key={guild.id} value={guild.id}>
            {guild.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function GuildPicker({
  guilds,
  loading,
  navigate
}: {
  guilds: Guild[];
  loading: boolean;
  navigate: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return guilds;
    return guilds.filter((guild) => `${guild.name} ${guild.id}`.toLowerCase().includes(needle));
  }, [guilds, query]);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Dashboard"
        title="Pilih guild"
        description="Hanya guild yang bisa Anda kelola dan relevan dengan bot yang ditampilkan."
      />
      <div className="toolbar surface">
        <TextField
          id="guild-search"
          label="Cari guild"
          placeholder="Nama guild atau ID"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {loading ? <Skeleton rows={6} /> : null}
      {!loading && !filtered.length ? (
        <EmptyState
          title="Tidak ada guild"
          body="Pastikan Anda punya MANAGE_GUILD dan bot sudah join ke server yang ingin dikelola."
        />
      ) : null}
      <div className="guild-grid">
        {filtered.map((guild) => (
          <button
            key={guild.id}
            type="button"
            className="guild-tile"
            onClick={() => navigate(`/dashboard/${encodeURIComponent(guild.id)}`)}
          >
            <GuildAvatar guild={guild} />
            <span>
              <strong>{guild.name}</strong>
              <small>{guild.botJoined === false ? "Bot belum terdeteksi" : "Siap dikelola"}</small>
            </span>
            <StatusPill tone={guild.canManage ? "success" : "warning"}>{guild.canManage ? "Admin" : "Read-only"}</StatusPill>
          </button>
        ))}
      </div>
    </div>
  );
}

function GuildAvatar({ guild }: { guild: Guild }) {
  const iconUrl = getDiscordGuildIconUrl(guild);
  return iconUrl ? (
    <img className="guild-avatar" src={iconUrl} alt={guild.name} />
  ) : (
    <span className="guild-avatar guild-avatar-fallback">{getInitial(guild.name)}</span>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

function GuildDashboard({
  guildId,
  guild,
  section,
  notify,
  navigate
}: {
  guildId: string;
  guild: Guild | null;
  section: SectionKey;
  notify: Notify;
  navigate: (path: string) => void;
}) {
  const permissionState = useAsyncData<Permission | null>(
    () => api.permissions(guildId),
    [guildId],
    null
  );

  const permission = permissionState.data;
  const canManage = Boolean(permission?.hasManageGuild);
  const title = guild?.name || `Guild ${guildId.slice(-4)}`;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Guild"
        title={title}
        description="Kelola konfigurasi bot, pantau status, dan audit perubahan tanpa command manual."
        actions={
          <div className="status-row">
            {permissionState.loading ? <StatusPill>Memuat akses</StatusPill> : null}
            {!permissionState.loading ? (
              <StatusPill tone={canManage ? "success" : "warning"}>
                {canManage ? "MANAGE_GUILD aktif" : "Read-only"}
              </StatusPill>
            ) : null}
            {permission?.botJoined === false ? <StatusPill tone="danger">Bot belum join</StatusPill> : <StatusPill tone="info">Bot terhubung</StatusPill>}
          </div>
        }
      />
      {permissionState.error ? (
        <Card>
          <p className="error-text">Gagal memuat permission: {permissionState.error}</p>
        </Card>
      ) : null}
      {section === "overview" ? (
        <OverviewPage guildId={guildId} canManage={canManage} notify={notify} navigate={navigate} />
      ) : null}
      {section === "trackers" ? (
        <TrackersPage guildId={guildId} canManage={canManage} notify={notify} />
      ) : null}
      {section === "title-watches" ? (
        <TitleWatchesPage guildId={guildId} canManage={canManage} notify={notify} />
      ) : null}
      {section === "settings" ? (
        <SettingsPage guildId={guildId} canManage={canManage} notify={notify} />
      ) : null}
      {section === "health" ? <HealthPage guildId={guildId} /> : null}
      {section === "logs" ? <LogsPage guildId={guildId} notify={notify} /> : null}
      {section === "notifications" ? <NotificationsPage guildId={guildId} notify={notify} /> : null}
      {section === "audit" ? <AuditPage guildId={guildId} notify={notify} /> : null}
    </div>
  );
}

function useGuildOptions(guildId: string) {
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [roles, setRoles] = useState<DiscordRole[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [channelPayload, rolePayload] = await Promise.all([
        api.channels(guildId).catch(() => ({ guildId, channels: [] })),
        api.roles(guildId).catch(() => ({ guildId, roles: [] }))
      ]);
      setChannels(channelPayload.channels || []);
      setRoles(rolePayload.roles || []);
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { channels, roles, loading, reload };
}

function OverviewPage({
  guildId,
  canManage,
  notify,
  navigate
}: {
  guildId: string;
  canManage: boolean;
  notify: Notify;
  navigate: (path: string) => void;
}) {
  const options = useGuildOptions(guildId);
  const [savingLog, setSavingLog] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [manualLogChannelId, setManualLogChannelId] = useState("");
  const state = useAsyncData(
    async () => {
      const [settings, trackers, watches, logs] = await Promise.all([
        api.settings(guildId),
        api.trackers(guildId),
        api.titleWatches(guildId),
        api.logs(guildId, "?scope=preview&limit=50").catch(() => [])
      ]);
      return { settings: settings || {}, trackers, watches, logs };
    },
    [guildId],
    { settings: {} as Settings, trackers: [] as Tracker[], watches: [] as TitleWatch[], logs: [] as LogEntry[] }
  );
  useAutoRefresh(true, state.reload, 45000);

  const settings = state.data.settings;
  const stepLog = Boolean(settings.logChannelId);
  const stepTracker = state.data.trackers.length > 0;
  const stepPreview = state.data.logs.some((item) => String(item.message || "").toLowerCase().includes("test preview"));
  const done = [stepLog, stepTracker, stepPreview].filter(Boolean).length;
  const progress = Math.round((done / 3) * 100);
  const next = !canManage
    ? "Akses read-only. MANAGE_GUILD diperlukan untuk menyelesaikan setup."
    : !stepLog
      ? "Pilih log channel untuk mulai mencatat perubahan."
      : !stepTracker
        ? "Tambahkan tracker pertama."
        : !stepPreview
          ? "Kirim test preview untuk memastikan konfigurasi benar."
          : "Setup guild sudah lengkap.";

  async function saveLogChannel(channelId: string) {
    setSavingLog(true);
    try {
      await api.request(`/v1/guilds/${encodeURIComponent(guildId)}/settings`, {
        method: "PATCH",
        body: { logChannelId: channelId || null }
      });
      notify("success", channelId ? "Log channel disimpan." : "Log channel dihapus.");
      await state.reload({ silent: true });
    } catch (error) {
      notify("error", `Gagal menyimpan log channel: ${getErrorMessage(error)}`);
    } finally {
      setSavingLog(false);
    }
  }

  async function sendPreview() {
    const trackerId = state.data.trackers[0]?.id || null;
    if (!trackerId) return;
    setPreviewBusy(true);
    try {
      await api.request(`/v1/guilds/${encodeURIComponent(guildId)}/preview/send-test`, {
        method: "POST",
        body: { trackerId }
      });
      notify("success", "Test preview diterima.");
      await state.reload({ silent: true });
    } catch (error) {
      notify("error", `Test preview gagal: ${getErrorMessage(error)}`);
    } finally {
      setPreviewBusy(false);
    }
  }

  if (state.loading) return <Skeleton rows={8} />;

  return (
    <div className="dashboard-grid">
      <Card className="setup-panel">
        <div className="setup-head">
          <div>
            <span className="eyebrow">Setup Wizard</span>
            <h2>{done}/3 langkah selesai</h2>
            <p>{next}</p>
          </div>
          <div className="setup-progress" aria-label={`Progress ${done} dari 3`}>
            <div>
              <span>{progress}%</span>
              <RefreshMeta updatedAt={state.updatedAt} refreshing={state.refreshing} />
            </div>
            <span className="progress-track">
              <span style={{ width: `${progress}%` }} />
            </span>
          </div>
        </div>
        <div className="step-list">
          <SetupStep done={stepLog} title="Set log channel" body={savingLog ? "Menyimpan log channel..." : channelLabel(settings.logChannelId, options.channels)}>
            {options.channels.length ? (
              <div className="inline-control">
                <select
                  value={settings.logChannelId || ""}
                  disabled={!canManage || options.loading || savingLog}
                  onChange={(event) => void saveLogChannel(event.target.value)}
                  aria-label="Pilih log channel"
                >
                  <option value="">Tidak diset</option>
                  {options.channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      #{channel.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="inline-control">
                <input
                  aria-label="Log channel ID manual"
                  placeholder="123456789012345678"
                  value={manualLogChannelId}
                  disabled={!canManage}
                  onChange={(event) => setManualLogChannelId(event.target.value)}
                />
                <Button
                  tone="secondary"
                  type="button"
                  loading={savingLog}
                  disabled={!canManage}
                  onClick={() => void saveLogChannel(manualLogChannelId.trim())}
                >
                  Simpan
                </Button>
              </div>
            )}
          </SetupStep>
          <SetupStep done={stepTracker} title="Tambah tracker pertama" body={`${state.data.trackers.length} tracker aktif`}>
            <Button
              tone="secondary"
              type="button"
              disabled={!canManage || !stepLog}
              onClick={() => navigate(routeForGuild(guildId, "trackers"))}
            >
              Buka Trackers
            </Button>
          </SetupStep>
          <SetupStep done={stepPreview} title="Kirim test preview" body="Validasi delivery ke Discord.">
            <Button tone="secondary" type="button" loading={previewBusy} disabled={!canManage || !stepTracker} onClick={() => void sendPreview()}>
              Kirim Preview
            </Button>
          </SetupStep>
        </div>
      </Card>
      <div className="metric-grid">
        <MetricCard label="Trackers" value={state.data.trackers.length} hint="Channel YouTube aktif" />
        <MetricCard label="Title Watches" value={state.data.watches.length} hint="Keyword aktif" />
        <MetricCard label="Prefix" value={settings.prefix || "?n"} hint="Command bot saat ini" />
        <MetricCard label="Preview" value={settings.previewOnAdd === false ? "Off" : "On"} hint="Preview saat add tracker" />
      </div>
    </div>
  );
}

function SetupStep({
  done,
  title,
  body,
  children
}: {
  done: boolean;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <article className="setup-step">
      <span className={cn("step-status", done && "step-status-done")}>
        {done ? <CheckCircle2 size={16} /> : <Circle size={15} />}
        {done ? "Selesai" : "Belum"}
      </span>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
        {children}
      </div>
    </article>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <Card className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </Card>
  );
}

function timestampMs(value?: string | null) {
  const ts = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ts) ? ts : 0;
}

function trackerLastCheckedAt(tracker: Tracker) {
  return tracker.lastCheckedAt || tracker.stateUpdatedAt || tracker.updatedAt || null;
}

function trackerConfigUpdatedAt(tracker: Tracker) {
  return tracker.configUpdatedAt || tracker.configuredAt || tracker.createdAt || null;
}

function watchLastMatchedAt(watch: TitleWatch) {
  return watch.lastMatchedAt || (watch.lastVideoId ? watch.stateUpdatedAt || watch.updatedAt || null : null);
}

function watchConfigUpdatedAt(watch: TitleWatch) {
  return watch.configUpdatedAt || watch.configuredAt || watch.createdAt || null;
}

function TrackersPage({
  guildId,
  canManage,
  notify
}: {
  guildId: string;
  canManage: boolean;
  notify: Notify;
}) {
  const options = useGuildOptions(guildId);
  const trackersState = useAsyncData(() => api.trackers(guildId), [guildId], [] as Tracker[]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("checked_desc");
  const [editing, setEditing] = useState<Tracker | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Tracker | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  useAutoRefresh(!drawerOpen && !deleteTarget, trackersState.reload, 30000);

  const view = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = trackersState.data.filter((tracker) => {
      if (!needle) return true;
      return [
        tracker.youtube?.title,
        tracker.youtube?.username,
        tracker.youtube?.channelId,
        tracker.discord?.channelId,
        tracker.notifications?.contentFilter
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    return [...filtered].sort((a, b) => {
      if (sort === "title_asc") return String(a.youtube?.title || "").localeCompare(String(b.youtube?.title || ""));
      if (sort === "title_desc") return String(b.youtube?.title || "").localeCompare(String(a.youtube?.title || ""));
      if (sort === "config_desc") return timestampMs(trackerConfigUpdatedAt(b)) - timestampMs(trackerConfigUpdatedAt(a));
      if (sort === "config_asc") return timestampMs(trackerConfigUpdatedAt(a)) - timestampMs(trackerConfigUpdatedAt(b));
      if (sort === "checked_asc") return timestampMs(trackerLastCheckedAt(a)) - timestampMs(trackerLastCheckedAt(b));
      return timestampMs(trackerLastCheckedAt(b)) - timestampMs(trackerLastCheckedAt(a));
    });
  }, [search, sort, trackersState.data]);

  async function deleteTracker() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.request(`/v1/guilds/${encodeURIComponent(guildId)}/trackers/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE"
      });
      notify("success", "Tracker dihapus.");
      setDeleteTarget(null);
      await trackersState.reload({ silent: true });
    } catch (error) {
      notify("error", `Hapus tracker gagal: ${getErrorMessage(error)}`);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function sendPreview(trackerId: string) {
    try {
      await api.request(`/v1/guilds/${encodeURIComponent(guildId)}/preview/send-test`, {
        method: "POST",
        body: { trackerId }
      });
      notify("success", "Test notification diterima.");
    } catch (error) {
      notify("error", `Test notification gagal: ${getErrorMessage(error)}`);
    }
  }

  const trackerColumns = useMemo<Array<DataTableColumn<Tracker>>>(
    () => [
      {
        id: "youtube",
        header: "YouTube",
        mobileLabel: "YouTube",
        sortingValue: (tracker) => tracker.youtube?.title || "",
        cell: (tracker) => (
          <div className="cell-stack">
            <strong>{tracker.youtube?.title || "-"}</strong>
            <small>{tracker.youtube?.username || "-"}</small>
            <code>{tracker.youtube?.channelId || "-"}</code>
          </div>
        )
      },
      {
        id: "target",
        header: "Discord Target",
        mobileLabel: "Target",
        cell: (tracker) => (
          <div className="cell-stack">
            <strong>{channelLabel(tracker.discord?.channelId, options.channels)}</strong>
            <small>{roleLabel(tracker.discord?.roleId, options.roles)}</small>
          </div>
        )
      },
      {
        id: "notifications",
        header: "Notifikasi",
        mobileLabel: "Notifikasi",
        cell: (tracker) => (
          <div className="cell-stack">
            <Badge tone="info">{tracker.notifications?.contentFilter || "all"}</Badge>
            <small>{tracker.notifications?.embedLayout || "compact"}</small>
          </div>
        )
      },
      {
        id: "updated",
        header: "Last Checked",
        mobileLabel: "Last Checked",
        sortingValue: (tracker) => timestampMs(trackerLastCheckedAt(tracker)),
        cell: (tracker) => (
          <div className="cell-stack">
            <small>{trackerLastCheckedAt(tracker) ? formatRelativeTime(trackerLastCheckedAt(tracker)) : "Belum dicek"}</small>
            <small>Video: {formatRelativeTime(tracker.lastVideoPublishedAt || tracker.lastPublishedAt)}</small>
          </div>
        )
      },
      {
        id: "actions",
        header: "Aksi",
        mobileLabel: "Aksi",
        className: "actions-cell",
        cell: (tracker) => (
          <ActionMenu>
            <ActionMenuItem disabled={!canManage} onSelect={() => void sendPreview(tracker.id)}>
              Test
            </ActionMenuItem>
            <ActionMenuItem
              disabled={!canManage}
              onSelect={() => {
                setEditing(tracker);
                setDrawerOpen(true);
              }}
            >
              Edit
            </ActionMenuItem>
            <ActionMenuItem tone="danger" disabled={!canManage} onSelect={() => setDeleteTarget(tracker)}>
              Hapus
            </ActionMenuItem>
          </ActionMenu>
        )
      }
    ],
    [canManage, options.channels, options.roles]
  );

  return (
    <div className="page-stack">
      <div className="toolbar surface">
        <TextField
          id="tracker-search"
          label="Cari tracker"
          placeholder="Judul, handle, channel, filter"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SelectField id="tracker-sort" label="Urutkan" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="checked_desc">Last checked terbaru</option>
          <option value="checked_asc">Last checked terlama</option>
          <option value="config_desc">Konfigurasi terbaru</option>
          <option value="config_asc">Konfigurasi terlama</option>
          <option value="title_asc">Judul A-Z</option>
          <option value="title_desc">Judul Z-A</option>
        </SelectField>
        <div className="toolbar-actions">
          <RefreshMeta updatedAt={trackersState.updatedAt} refreshing={trackersState.refreshing} />
          <ActionMenu label="Opsi tracker">
            <ActionMenuItem onSelect={() => void trackersState.reload({ silent: true })}>Refresh sekarang</ActionMenuItem>
          </ActionMenu>
          <Button
            type="button"
            icon={<Plus size={16} />}
            disabled={!canManage}
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
          >
            Tambah Tracker
          </Button>
        </div>
      </div>
      {!canManage ? <DisabledNotice /> : null}
      <DataTable
        data={view}
        columns={trackerColumns}
        getRowId={(tracker) => tracker.id}
        loading={trackersState.loading}
        empty={
          <EmptyState
            title="Belum ada tracker"
            body="Tambahkan channel YouTube pertama agar Conot bisa mengirim notifikasi ke Discord."
          />
        }
      />
      <Drawer
        open={drawerOpen}
        title={editing ? "Edit tracker" : "Tambah tracker"}
        description="Gunakan resolver untuk mengurangi salah channel, lalu pilih target Discord."
        onClose={() => setDrawerOpen(false)}
      >
        <TrackerForm
          guildId={guildId}
          tracker={editing}
          canManage={canManage}
          channels={options.channels}
          roles={options.roles}
          notify={notify}
          onSaved={async () => {
            setDrawerOpen(false);
            await trackersState.reload({ silent: true });
          }}
        />
      </Drawer>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus tracker?"
        description={`Tracker ${deleteTarget?.youtube?.title || deleteTarget?.youtube?.username || ""} akan dihapus dari guild ini.`}
        busy={deleteBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteTracker()}
      />
    </div>
  );
}

const trackerFormSchema = z.object({
  source: z.string(),
  username: z.string().trim().min(1, "Username/handle wajib diisi."),
  channelId: z.string().trim().min(1, "Channel ID wajib diisi."),
  title: z.string().trim().min(1, "Title wajib diisi."),
  discordChannelId: z.string().trim().min(1, "Target Discord wajib dipilih."),
  roleId: z.string().trim().refine((value) => !value || /^\d{10,20}$/.test(value), "Role ID tidak valid."),
  contentFilter: z.string().min(1),
  embedLayout: z.string().min(1),
  customMessage: z.string(),
  titleFilters: z.string()
});

type TrackerFormValues = z.infer<typeof trackerFormSchema>;

const titleWatchFormSchema = z.object({
  keyword: z.string().trim().min(2, "Keyword minimal 2 karakter.").max(120, "Keyword maksimal 120 karakter."),
  channelId: z.string().trim().min(1, "Target Discord wajib dipilih."),
  roleId: z.string().trim(),
  maxAgeDays: z.number().int("Max age harus angka bulat.").min(1, "Max age minimal 1 hari.").max(30, "Max age maksimal 30 hari.")
});

type TitleWatchFormValues = z.infer<typeof titleWatchFormSchema>;

const settingsFormSchema = z.object({
  prefix: z.string().trim().min(1, "Prefix wajib diisi.").max(10, "Prefix maksimal 10 karakter."),
  logChannelId: z.string().trim(),
  logLevel: z.string().trim().min(1, "Log level wajib dipilih."),
  previewOnAdd: z.boolean()
});

type SettingsFormValues = z.infer<typeof settingsFormSchema>;

function applyFormErrors<T extends FieldValues>(
  fieldErrors: Record<string, string>,
  setError: UseFormSetError<T>
) {
  Object.entries(fieldErrors).forEach(([field, message]) => {
    const normalized = field.split(".").pop() || field;
    setError(normalized as Path<T>, { type: "server", message });
  });
}

function TrackerForm({
  guildId,
  tracker,
  canManage,
  channels,
  roles,
  notify,
  onSaved
}: {
  guildId: string;
  tracker: Tracker | null;
  canManage: boolean;
  channels: DiscordChannel[];
  roles: DiscordRole[];
  notify: Notify;
  onSaved: () => Promise<void>;
}) {
  const defaultValues = {
    source: tracker?.youtube?.username || "",
    username: tracker?.youtube?.username || "",
    channelId: tracker?.youtube?.channelId || "",
    title: tracker?.youtube?.title || "",
    discordChannelId: tracker?.discord?.channelId || "",
    roleId: tracker?.discord?.roleId || "",
    contentFilter: tracker?.notifications?.contentFilter || "all",
    embedLayout: tracker?.notifications?.embedLayout || "compact",
    customMessage: tracker?.notifications?.customMessage || "",
    titleFilters: (tracker?.notifications?.titleFilters || []).join(", ")
  };
  const form = useForm<TrackerFormValues>({
    resolver: zodResolver(trackerFormSchema),
    defaultValues
  });
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    watch,
    formState: { errors, isDirty, isSubmitting }
  } = form;
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<YoutubeResolveResult | null>(null);

  const selectedChannelId = watch("discordChannelId");
  const selectedRoleId = watch("roleId");
  const customMessage = watch("customMessage");
  const title = watch("title");

  async function resolveSource() {
    setResolving(true);
    try {
      const values = getValues();
      const result = await api.resolveYoutube(guildId, values.source || values.username || values.channelId);
      setResolved(result);
      setValue("username", result.username, { shouldDirty: true, shouldValidate: true });
      setValue("channelId", result.channelId, { shouldDirty: true, shouldValidate: true });
      setValue("title", result.title || values.title, { shouldDirty: true, shouldValidate: true });
      notify("success", "Sumber YouTube berhasil di-resolve.");
    } catch (error) {
      applyFormErrors(getFieldErrors(error), setError);
      notify("error", `Resolve YouTube gagal: ${getErrorMessage(error)}`);
    } finally {
      setResolving(false);
    }
  }

  async function save(values: TrackerFormValues) {
    try {
      if (tracker) {
        await api.request(`/v1/guilds/${encodeURIComponent(guildId)}/trackers/${encodeURIComponent(tracker.id)}`, {
          method: "PATCH",
          body: {
            channelId: values.discordChannelId,
            roleId: values.roleId || null,
            contentFilter: values.contentFilter,
            embedLayout: values.embedLayout,
            customMessage: values.customMessage || null,
            titleFilters: splitList(values.titleFilters)
          }
        });
      } else {
        await api.request(`/v1/guilds/${encodeURIComponent(guildId)}/trackers`, {
          method: "POST",
          body: {
            youtube: {
              username: values.username,
              channelId: values.channelId,
              title: values.title
            },
            discord: {
              channelId: values.discordChannelId,
              roleId: values.roleId || null
            },
            notifications: {
              contentFilter: values.contentFilter,
              embedLayout: values.embedLayout,
              customMessage: values.customMessage || null,
              titleFilters: splitList(values.titleFilters)
            }
          }
        });
      }
      notify("success", tracker ? "Tracker diupdate." : "Tracker ditambahkan.");
      await onSaved();
    } catch (error) {
      applyFormErrors(getFieldErrors(error), setError);
      notify("error", `Simpan tracker gagal: ${getErrorMessage(error)}`);
    }
  }

  return (
    <form className="stack" data-dirty={isDirty ? "true" : "false"} onSubmit={(event) => void handleSubmit(save)(event)}>
      {!tracker ? (
        <Card className="form-section">
          <TextField
            id="tracker-source"
            label="Sumber YouTube"
            help="Masukkan @handle, URL channel, atau UC channel ID. Resolver hanya membantu, input manual tetap tersedia."
            placeholder="@namaChannel atau https://www.youtube.com/@namaChannel"
            error={errors.source?.message}
            {...register("source")}
          />
          <Button variant="secondary" type="button" icon={<Search size={16} />} loading={resolving} disabled={!canManage} onClick={() => void resolveSource()}>
            Resolve YouTube
          </Button>
          {resolved ? (
            <div className="resolved-box">
              <strong>{resolved.title}</strong>
              <small>{resolved.channelId}</small>
              {resolved.latestVideo ? <span>Video terbaru: {resolved.latestVideo.title}</span> : null}
            </div>
          ) : null}
        </Card>
      ) : null}
      <div className="form-grid">
        <TextField
          id="tracker-username"
          label="YouTube Username/Handle"
          readOnly={Boolean(tracker)}
          error={errors.username?.message}
          {...register("username")}
        />
        <TextField
          id="tracker-channel-id"
          label="YouTube Channel ID"
          readOnly={Boolean(tracker)}
          error={errors.channelId?.message}
          {...register("channelId")}
        />
        <TextField
          id="tracker-title"
          label="YouTube Title"
          readOnly={Boolean(tracker)}
          error={errors.title?.message}
          {...register("title")}
        />
        {channels.length ? (
          <SelectField
            id="tracker-discord-channel"
            label="Target Discord"
            error={errors.discordChannelId?.message}
            {...register("discordChannelId")}
          >
            <option value="">Pilih channel</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                #{channel.name}
              </option>
            ))}
            {selectedChannelId && !channels.some((channel) => channel.id === selectedChannelId) ? (
              <option value={selectedChannelId}>#{selectedChannelId}</option>
            ) : null}
          </SelectField>
        ) : (
          <TextField
            id="tracker-discord-channel"
            label="Target Discord ID"
            help="Daftar channel tidak tersedia. Isi ID channel manual."
            error={errors.discordChannelId?.message}
            {...register("discordChannelId")}
          />
        )}
        {roles.length ? (
          <SelectField
            id="tracker-role"
            label="Ping Role"
            error={errors.roleId?.message}
            {...register("roleId")}
          >
            <option value="">Tanpa role</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                @{role.name}
              </option>
            ))}
            {selectedRoleId && !roles.some((role) => role.id === selectedRoleId) ? (
              <option value={selectedRoleId}>@{selectedRoleId}</option>
            ) : null}
          </SelectField>
        ) : (
          <TextField
            id="tracker-role"
            label="Ping Role ID"
            help="Opsional. Isi manual jika role picker tidak tersedia."
            error={errors.roleId?.message}
            {...register("roleId")}
          />
        )}
        <SelectField
          id="tracker-filter"
          label="Content Filter"
          {...register("contentFilter")}
        >
          {contentFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="tracker-layout"
          label="Embed Layout"
          {...register("embedLayout")}
        >
          {embedLayoutOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </div>
      <TextAreaField
        id="tracker-message"
        label="Custom Message"
        help="Placeholder: {channel}, {title}, {link}, {type}"
        {...register("customMessage")}
      />
      <div className="template-preview">
        <span>Preview</span>
        <pre>{renderCustomMessageTemplate(customMessage, title)}</pre>
      </div>
      <TextField
        id="tracker-title-filters"
        label="Title Filters"
        help="Pisahkan keyword dengan koma."
        {...register("titleFilters")}
      />
      <div className="drawer-form-actions">
        <Button type="submit" icon={<Save size={16} />} loading={isSubmitting} disabled={!canManage}>
          {tracker ? "Simpan Update" : "Tambah Tracker"}
        </Button>
      </div>
    </form>
  );
}

function TitleWatchesPage({
  guildId,
  canManage,
  notify
}: {
  guildId: string;
  canManage: boolean;
  notify: Notify;
}) {
  const options = useGuildOptions(guildId);
  const watchesState = useAsyncData(() => api.titleWatches(guildId), [guildId], [] as TitleWatch[]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("match_desc");
  const [editing, setEditing] = useState<TitleWatch | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TitleWatch | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  useAutoRefresh(!drawerOpen && !deleteTarget, watchesState.reload, 45000);

  const view = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = watchesState.data.filter((watch) => {
      if (!needle) return true;
      return [watch.keyword, watch.channelId, watch.roleId].join(" ").toLowerCase().includes(needle);
    });
    return [...filtered].sort((a, b) => {
      if (sort === "keyword_asc") return String(a.keyword || "").localeCompare(String(b.keyword || ""));
      if (sort === "keyword_desc") return String(b.keyword || "").localeCompare(String(a.keyword || ""));
      if (sort === "config_desc") return timestampMs(watchConfigUpdatedAt(b)) - timestampMs(watchConfigUpdatedAt(a));
      if (sort === "config_asc") return timestampMs(watchConfigUpdatedAt(a)) - timestampMs(watchConfigUpdatedAt(b));
      if (sort === "match_asc") return timestampMs(watchLastMatchedAt(a)) - timestampMs(watchLastMatchedAt(b));
      return timestampMs(watchLastMatchedAt(b)) - timestampMs(watchLastMatchedAt(a));
    });
  }, [search, sort, watchesState.data]);

  async function deleteWatch() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.request(`/v1/guilds/${encodeURIComponent(guildId)}/title-watches/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE"
      });
      notify("success", "Title watch dihapus.");
      setDeleteTarget(null);
      await watchesState.reload({ silent: true });
    } catch (error) {
      notify("error", `Hapus title watch gagal: ${getErrorMessage(error)}`);
    } finally {
      setDeleteBusy(false);
    }
  }

  const watchColumns = useMemo<Array<DataTableColumn<TitleWatch>>>(
    () => [
      {
        id: "keyword",
        header: "Keyword",
        mobileLabel: "Keyword",
        sortingValue: (watch) => watch.keyword || "",
        cell: (watch) => <strong>{watch.keyword}</strong>
      },
      {
        id: "target",
        header: "Target",
        mobileLabel: "Target",
        cell: (watch) => (
          <div className="cell-stack">
            <strong>{channelLabel(watch.channelId, options.channels)}</strong>
            <small>{roleLabel(watch.roleId, options.roles)}</small>
          </div>
        )
      },
      {
        id: "maxAgeDays",
        header: "Max Age",
        mobileLabel: "Max Age",
        sortingValue: (watch) => watch.maxAgeDays,
        cell: (watch) => `${watch.maxAgeDays} hari`
      },
      {
        id: "updated",
        header: "Last Match",
        mobileLabel: "Last Match",
        sortingValue: (watch) => timestampMs(watchLastMatchedAt(watch)),
        cell: (watch) => (
          <div className="cell-stack">
            <small>{watchLastMatchedAt(watch) ? formatRelativeTime(watchLastMatchedAt(watch)) : "Belum ada match"}</small>
            <small>Config: {formatRelativeTime(watchConfigUpdatedAt(watch))}</small>
          </div>
        )
      },
      {
        id: "actions",
        header: "Aksi",
        mobileLabel: "Aksi",
        className: "actions-cell",
        cell: (watch) => (
          <ActionMenu>
            <ActionMenuItem
              disabled={!canManage}
              onSelect={() => {
                setEditing(watch);
                setDrawerOpen(true);
              }}
            >
              Edit
            </ActionMenuItem>
            <ActionMenuItem tone="danger" disabled={!canManage} onSelect={() => setDeleteTarget(watch)}>
              Hapus
            </ActionMenuItem>
          </ActionMenu>
        )
      }
    ],
    [canManage, options.channels, options.roles]
  );

  return (
    <div className="page-stack">
      <div className="toolbar surface">
        <TextField
          id="watch-search"
          label="Cari title watch"
          placeholder="Keyword, channel, role"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SelectField id="watch-sort" label="Urutkan" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="match_desc">Last match terbaru</option>
          <option value="match_asc">Last match terlama</option>
          <option value="config_desc">Konfigurasi terbaru</option>
          <option value="config_asc">Konfigurasi terlama</option>
          <option value="keyword_asc">Keyword A-Z</option>
          <option value="keyword_desc">Keyword Z-A</option>
        </SelectField>
        <div className="toolbar-actions">
          <RefreshMeta updatedAt={watchesState.updatedAt} refreshing={watchesState.refreshing} />
          <ActionMenu label="Opsi title watch">
            <ActionMenuItem onSelect={() => void watchesState.reload({ silent: true })}>Refresh sekarang</ActionMenuItem>
          </ActionMenu>
          <Button
            type="button"
            icon={<Plus size={16} />}
            disabled={!canManage}
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
          >
            Tambah Title Watch
          </Button>
        </div>
      </div>
      {!canManage ? <DisabledNotice /> : null}
      <DataTable
        data={view}
        columns={watchColumns}
        getRowId={(watch) => watch.id}
        loading={watchesState.loading}
        empty={
          <EmptyState
            title="Belum ada title watch"
            body="Pantau keyword lintas pencarian YouTube dengan target channel Discord tertentu."
          />
        }
      />
      <Drawer
        open={drawerOpen}
        title={editing ? "Edit title watch" : "Tambah title watch"}
        description="Gunakan channel picker agar target Discord tidak salah."
        onClose={() => setDrawerOpen(false)}
      >
        <TitleWatchForm
          guildId={guildId}
          watch={editing}
          canManage={canManage}
          channels={options.channels}
          roles={options.roles}
          notify={notify}
          onSaved={async () => {
            setDrawerOpen(false);
            await watchesState.reload({ silent: true });
          }}
        />
      </Drawer>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus title watch?"
        description={`Keyword ${deleteTarget?.keyword || ""} akan dihapus dari guild ini.`}
        busy={deleteBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteWatch()}
      />
    </div>
  );
}

function TitleWatchForm({
  guildId,
  watch,
  canManage,
  channels,
  roles,
  notify,
  onSaved
}: {
  guildId: string;
  watch: TitleWatch | null;
  canManage: boolean;
  channels: DiscordChannel[];
  roles: DiscordRole[];
  notify: Notify;
  onSaved: () => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    setError,
    watch: watchValue,
    formState: { errors, isDirty, isSubmitting }
  } = useForm<TitleWatchFormValues>({
    resolver: zodResolver(titleWatchFormSchema),
    defaultValues: {
      keyword: watch?.keyword || "",
      channelId: watch?.channelId || "",
      roleId: watch?.roleId || "",
      maxAgeDays: watch?.maxAgeDays || 3
    }
  });

  const selectedChannelId = watchValue("channelId");
  const selectedRoleId = watchValue("roleId");

  async function save(values: TitleWatchFormValues) {
    try {
      const body = {
        keyword: values.keyword.trim(),
        channelId: values.channelId.trim(),
        roleId: values.roleId || null,
        maxAgeDays: values.maxAgeDays
      };
      if (watch) {
        await api.request(`/v1/guilds/${encodeURIComponent(guildId)}/title-watches/${encodeURIComponent(watch.id)}`, {
          method: "PATCH",
          body
        });
      } else {
        await api.request(`/v1/guilds/${encodeURIComponent(guildId)}/title-watches`, {
          method: "POST",
          body
        });
      }
      notify("success", watch ? "Title watch diupdate." : "Title watch ditambahkan.");
      await onSaved();
    } catch (error) {
      applyFormErrors(getFieldErrors(error), setError);
      notify("error", `Simpan title watch gagal: ${getErrorMessage(error)}`);
    }
  }

  return (
    <form className="stack" data-dirty={isDirty ? "true" : "false"} onSubmit={(event) => void handleSubmit(save)(event)}>
      <div className="form-grid">
        <TextField
          id="watch-keyword"
          label="Keyword"
          error={errors.keyword?.message}
          {...register("keyword")}
        />
        {channels.length ? (
          <SelectField
            id="watch-channel"
            label="Target Discord"
            error={errors.channelId?.message}
            {...register("channelId")}
          >
            <option value="">Pilih channel</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                #{channel.name}
              </option>
            ))}
            {selectedChannelId && !channels.some((channel) => channel.id === selectedChannelId) ? (
              <option value={selectedChannelId}>#{selectedChannelId}</option>
            ) : null}
          </SelectField>
        ) : (
          <TextField
            id="watch-channel"
            label="Target Discord ID"
            help="Daftar channel tidak tersedia. Isi ID channel manual."
            error={errors.channelId?.message}
            {...register("channelId")}
          />
        )}
        {roles.length ? (
          <SelectField id="watch-role" label="Ping Role" error={errors.roleId?.message} {...register("roleId")}>
            <option value="">Tanpa role</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                @{role.name}
              </option>
            ))}
            {selectedRoleId && !roles.some((role) => role.id === selectedRoleId) ? (
              <option value={selectedRoleId}>@{selectedRoleId}</option>
            ) : null}
          </SelectField>
        ) : (
          <TextField
            id="watch-role"
            label="Ping Role ID"
            help="Opsional. Isi manual jika role picker tidak tersedia."
            error={errors.roleId?.message}
            {...register("roleId")}
          />
        )}
        <TextField
          id="watch-max-age"
          label="Max Age Days"
          type="number"
          min={1}
          max={30}
          error={errors.maxAgeDays?.message}
          {...register("maxAgeDays", { valueAsNumber: true })}
        />
      </div>
      <div className="drawer-form-actions">
        <Button type="submit" icon={<Save size={16} />} loading={isSubmitting} disabled={!canManage}>
          {watch ? "Simpan Update" : "Tambah Title Watch"}
        </Button>
      </div>
    </form>
  );
}

function SettingsPage({
  guildId,
  canManage,
  notify
}: {
  guildId: string;
  canManage: boolean;
  notify: Notify;
}) {
  const options = useGuildOptions(guildId);
  const settingsState = useAsyncData(() => api.settings(guildId), [guildId], null as Settings | null);
  const trackersState = useAsyncData(() => api.trackers(guildId), [guildId], [] as Tracker[]);
  const [previewTrackerId, setPreviewTrackerId] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting }
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: { prefix: "?n", logChannelId: "", logLevel: "warn", previewOnAdd: true }
  });
  useAutoRefresh(!isDirty, settingsState.reload, 60000);

  useEffect(() => {
    const settings = settingsState.data || {};
    reset({
      prefix: settings.prefix || "?n",
      logChannelId: settings.logChannelId || "",
      logLevel: settings.logLevel || "warn",
      previewOnAdd: settings.previewOnAdd !== false
    });
  }, [reset, settingsState.data]);

  useEffect(() => {
    setPreviewTrackerId((current) => current || trackersState.data[0]?.id || "");
  }, [trackersState.data]);

  async function save(values: SettingsFormValues) {
    try {
      await api.request(`/v1/guilds/${encodeURIComponent(guildId)}/settings`, {
        method: "PATCH",
        body: {
          prefix: values.prefix.trim(),
          logChannelId: values.logChannelId || null,
          logLevel: values.logLevel,
          previewOnAdd: values.previewOnAdd
        }
      });
      notify("success", "Settings disimpan.");
      await settingsState.reload({ silent: true });
    } catch (error) {
      applyFormErrors(getFieldErrors(error), setError);
      notify("error", `Simpan settings gagal: ${getErrorMessage(error)}`);
    }
  }

  async function sendPreview() {
    if (!previewTrackerId) return;
    setPreviewBusy(true);
    try {
      await api.request(`/v1/guilds/${encodeURIComponent(guildId)}/preview/send-test`, {
        method: "POST",
        body: { trackerId: previewTrackerId }
      });
      notify("success", "Test notification diterima.");
    } catch (error) {
      notify("error", `Send test gagal: ${getErrorMessage(error)}`);
    } finally {
      setPreviewBusy(false);
    }
  }

  if (settingsState.loading) return <Skeleton rows={6} />;

  return (
    <div className="settings-grid">
      <Card>
        <form className="stack" data-dirty={isDirty ? "true" : "false"} onSubmit={(event) => void handleSubmit(save)(event)}>
          <div className="section-heading">
            <h2>Konfigurasi Guild</h2>
            <p>Pengaturan dasar yang memengaruhi command dan log operasional.</p>
          </div>
          <div className="form-grid">
            <TextField
              id="settings-prefix"
              label="Prefix"
              error={errors.prefix?.message}
              {...register("prefix")}
            />
            {options.channels.length ? (
              <SelectField
                id="settings-log-channel"
                label="Log Channel"
                error={errors.logChannelId?.message}
                {...register("logChannelId")}
              >
                <option value="">Tidak diset</option>
                {options.channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    #{channel.name}
                  </option>
                ))}
              </SelectField>
            ) : (
              <TextField
                id="settings-log-channel"
                label="Log Channel ID"
                help="Daftar channel tidak tersedia. Isi ID manual."
                error={errors.logChannelId?.message}
                {...register("logChannelId")}
              />
            )}
            <SelectField
              id="settings-log-level"
              label="Log Level"
              error={errors.logLevel?.message}
              {...register("logLevel")}
            >
              {logLevelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </div>
          <Controller
            control={control}
            name="previewOnAdd"
            render={({ field }) => (
              <ToggleField
                id="settings-preview-on-add"
                label="Preview On Add"
                checked={field.value}
                help="Kirim preview otomatis setelah tracker baru dibuat."
                onChange={field.onChange}
              />
            )}
          />
          <Button type="submit" icon={<Save size={16} />} loading={isSubmitting} disabled={!canManage}>
            Simpan Settings
          </Button>
        </form>
      </Card>
      <Card>
        <div className="section-heading">
          <h2>Test Notification</h2>
          <p>Gunakan untuk memvalidasi delivery tanpa menunggu video baru.</p>
        </div>
        <SelectField
          id="settings-preview-tracker"
          label="Tracker"
          value={previewTrackerId}
          onChange={(event) => setPreviewTrackerId(event.target.value)}
        >
          <option value="">Pilih tracker</option>
          {trackersState.data.map((tracker) => (
            <option key={tracker.id} value={tracker.id}>
              {tracker.youtube?.title || tracker.id}
            </option>
          ))}
        </SelectField>
        <Button type="button" variant="secondary" icon={<Send size={16} />} loading={previewBusy} disabled={!canManage || !previewTrackerId} onClick={() => void sendPreview()}>
          Kirim Test
        </Button>
      </Card>
    </div>
  );
}

function HealthPage({ guildId }: { guildId: string }) {
  const healthState = useAsyncData(() => api.health(guildId), [guildId], {} as Health);
  useAutoRefresh(true, healthState.reload, 30000);
  const health = healthState.data;
  const heap = Number(health.runtime?.heapUsedMb || 0);
  const rss = Number(health.runtime?.rssMemoryMb || 0);
  const storageOk = health.storage?.dataFileExists !== false;
  const tone = !storageOk || heap >= 768 || rss >= 1536 ? "danger" : heap >= 512 || rss >= 1024 ? "warning" : "success";

  if (healthState.loading) return <Skeleton rows={6} />;

  return (
    <div className="page-stack">
      <div className="toolbar surface">
        <StatusPill tone={tone}>{tone === "success" ? "Healthy" : tone === "warning" ? "Warning" : "Critical"}</StatusPill>
        <span className="muted">{storageOk ? "Indikator utama tersedia." : "Storage utama tidak ditemukan."}</span>
        <div className="toolbar-actions">
          <RefreshMeta updatedAt={healthState.updatedAt} refreshing={healthState.refreshing} />
          <ActionMenu label="Opsi health">
            <ActionMenuItem onSelect={() => void healthState.reload({ silent: true })}>Refresh sekarang</ActionMenuItem>
          </ActionMenu>
        </div>
      </div>
      <div className="metric-grid">
        <MetricCard label="Uptime" value={formatUptime(health.runtime?.uptimeSec || 0)} hint="Runtime API" />
        <MetricCard label="RSS Memory" value={`${health.runtime?.rssMemoryMb || 0} MB`} hint="Resident set size" />
        <MetricCard label="Heap Used" value={`${health.runtime?.heapUsedMb || 0} MB`} hint="Memory JS" />
        <MetricCard label="Storage" value={health.storage?.driver || "json"} hint={health.storage?.resourceName || "-"} />
      </div>
      <Card>
        <div className="data-list">
          <span>Trackers</span>
          <strong>{health.config?.trackerCount || 0}</strong>
          <span>Title Watches</span>
          <strong>{health.config?.titleWatchCount || 0}</strong>
          <span>Storage Updated</span>
          <strong>{formatDateTime(health.storage?.dataFileModifiedAt)}</strong>
          <span>Storage Age</span>
          <strong>{formatRelativeTime(health.storage?.dataFileModifiedAt)}</strong>
        </div>
      </Card>
    </div>
  );
}

function LogsPage({ guildId, notify }: { guildId: string; notify: Notify }) {
  return (
    <ActivityPage<LogEntry>
      guildId={guildId}
      storageKey="logs"
      title="Logs"
      description="Warn/error operasional per guild."
      notify={notify}
      defaults={{ level: "", scope: "", q: "", fromDate: "", toDate: "", rangePreset: "", limit: "200" }}
      load={(query) => api.logs(guildId, query)}
      exportPath={(query) => `/v1/guilds/${encodeURIComponent(guildId)}/logs/export${query}`}
      filename={(format) => `conot-logs-${guildId}-${formatDateForFilename()}.${format}`}
      filters={(state, setState) => (
        <>
          <SelectField id="logs-level" label="Level" value={state.level} onChange={(event) => setState("level", event.target.value)}>
            <option value="">Semua</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </SelectField>
          <TextField id="logs-scope" label="Scope" value={state.scope} onChange={(event) => setState("scope", event.target.value)} />
        </>
      )}
      query={(state) =>
        queryFromRecord({
          level: state.level,
          scope: state.scope,
          q: state.q,
          from: toIsoFromDateInput(state.fromDate || "", false),
          to: toIsoFromDateInput(state.toDate || "", true),
          limit: state.limit
        })
      }
      getRowId={(entry, index) => entry.id || `${entry.createdAt}-${entry.message}-${index}`}
      columns={[
        {
          id: "time",
          header: "Waktu",
          mobileLabel: "Waktu",
          sortingValue: (entry) => new Date(entry.createdAt || 0).getTime(),
          cell: (entry) => (
            <div className="cell-stack">
              <small>{formatDateTime(entry.createdAt)}</small>
              <small>{formatRelativeTime(entry.createdAt)}</small>
            </div>
          )
        },
        {
          id: "level",
          header: "Level",
          mobileLabel: "Level",
          cell: (entry) => <Badge tone={entry.level === "error" ? "danger" : "warning"}>{entry.level || "-"}</Badge>
        },
        {
          id: "scope",
          header: "Scope",
          mobileLabel: "Scope",
          cell: (entry) => <code>{entry.scope || "-"}</code>
        },
        {
          id: "message",
          header: "Message",
          mobileLabel: "Message",
          cell: (entry) => entry.message || "-"
        },
        {
          id: "meta",
          header: "Meta",
          mobileLabel: "Meta",
          cell: (entry) => <code>{compactJson(entry.meta)}</code>
        }
      ]}
      detail={(entry) => <JsonDetail value={entry} />}
    />
  );
}

function NotificationsPage({ guildId, notify }: { guildId: string; notify: Notify }) {
  return (
    <ActivityPage<NotificationEntry>
      guildId={guildId}
      storageKey="notifications"
      title="Notifications"
      description="Riwayat notifikasi tracker dan title watch."
      notify={notify}
      defaults={{ source: "", status: "", event: "", q: "", fromDate: "", toDate: "", rangePreset: "", limit: "200" }}
      load={(query) => api.notifications(guildId, query)}
      exportPath={(query) => `/v1/guilds/${encodeURIComponent(guildId)}/notifications/export${query}`}
      filename={(format) => `conot-notifications-${guildId}-${formatDateForFilename()}.${format}`}
      filters={(state, setState) => (
        <>
          <SelectField id="notif-source" label="Source" value={state.source} onChange={(event) => setState("source", event.target.value)}>
            <option value="">Semua</option>
            <option value="tracker">tracker</option>
            <option value="titlewatch">titlewatch</option>
          </SelectField>
          <SelectField id="notif-status" label="Status" value={state.status} onChange={(event) => setState("status", event.target.value)}>
            <option value="">Semua</option>
            <option value="sent">sent</option>
            <option value="blocked">blocked</option>
            <option value="failed">failed</option>
          </SelectField>
          <SelectField id="notif-event" label="Event" value={state.event} onChange={(event) => setState("event", event.target.value)}>
            <option value="">Semua</option>
            <option value="new">new</option>
            <option value="followup">followup</option>
          </SelectField>
        </>
      )}
      query={(state) =>
        queryFromRecord({
          source: state.source,
          status: state.status,
          event: state.event,
          q: state.q,
          from: toIsoFromDateInput(state.fromDate || "", false),
          to: toIsoFromDateInput(state.toDate || "", true),
          limit: state.limit
        })
      }
      getRowId={(entry, index) => entry.id || `${entry.createdAt}-${entry.videoId}-${index}`}
      columns={[
        {
          id: "time",
          header: "Waktu",
          mobileLabel: "Waktu",
          sortingValue: (entry) => new Date(entry.createdAt || 0).getTime(),
          cell: (entry) => (
            <div className="cell-stack">
              <small>{formatDateTime(entry.createdAt)}</small>
              <small>{formatRelativeTime(entry.createdAt)}</small>
            </div>
          )
        },
        {
          id: "source",
          header: "Sumber",
          mobileLabel: "Sumber",
          cell: (entry) => (
            <div className="cell-stack">
              <Badge tone="info">{entry.source || "-"}</Badge>
              <small>{entry.event || "-"}</small>
            </div>
          )
        },
        {
          id: "status",
          header: "Status",
          mobileLabel: "Status",
          cell: (entry) => (
            <Badge tone={entry.status === "failed" ? "danger" : entry.status === "blocked" ? "warning" : "success"}>
              {entry.status || "-"}
            </Badge>
          )
        },
        {
          id: "channel",
          header: "Channel/Keyword",
          mobileLabel: "Channel",
          cell: (entry) =>
            [entry.youtubeChannelTitle || entry.youtubeUsername || "-", entry.keyword ? `keyword: ${entry.keyword}` : ""]
              .filter(Boolean)
              .join(" | ")
        },
        {
          id: "video",
          header: "Video",
          mobileLabel: "Video",
          cell: (entry) => (
            <div className="cell-stack">
              {entry.link ? (
                <a href={entry.link} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                  {entry.title || entry.videoId || "Buka video"}
                </a>
              ) : (
                entry.title || entry.videoId || "-"
              )}
              <small>{entry.contentLabel || entry.contentState || "-"}</small>
            </div>
          )
        },
        {
          id: "discord",
          header: "Discord",
          mobileLabel: "Discord",
          cell: (entry) => <code>{entry.discordChannelId || "-"}</code>
        }
      ]}
      detail={(entry) => <JsonDetail value={entry} />}
    />
  );
}

function AuditPage({ guildId, notify }: { guildId: string; notify: Notify }) {
  return (
    <ActivityPage<AuditEntry>
      guildId={guildId}
      storageKey="audit"
      title="Audit"
      description="Diff konfigurasi sebelum dan sesudah mutasi."
      notify={notify}
      defaults={{ action: "", resourceType: "", actorUserId: "", q: "", fromDate: "", toDate: "", rangePreset: "", limit: "150" }}
      load={(query) => api.auditLogs(guildId, query)}
      exportPath={(query) => `/v1/guilds/${encodeURIComponent(guildId)}/audit-logs/export${query}`}
      filename={(format) => `conot-audit-${guildId}-${formatDateForFilename()}.${format}`}
      filters={(state, setState) => (
        <>
          <TextField id="audit-action" label="Action" value={state.action} onChange={(event) => setState("action", event.target.value)} />
          <SelectField
            id="audit-resource"
            label="Resource"
            value={state.resourceType}
            onChange={(event) => setState("resourceType", event.target.value)}
          >
            <option value="">Semua</option>
            <option value="tracker">tracker</option>
            <option value="titlewatch">titlewatch</option>
            <option value="setting">setting</option>
          </SelectField>
          <TextField id="audit-actor" label="Actor" value={state.actorUserId} onChange={(event) => setState("actorUserId", event.target.value)} />
        </>
      )}
      query={(state) =>
        queryFromRecord({
          action: state.action,
          resourceType: state.resourceType,
          actorUserId: state.actorUserId,
          q: state.q,
          from: toIsoFromDateInput(state.fromDate || "", false),
          to: toIsoFromDateInput(state.toDate || "", true),
          limit: state.limit
        })
      }
      getRowId={(entry, index) => entry.id || `${entry.createdAt}-${entry.action}-${index}`}
      columns={[
        {
          id: "action",
          header: "Aksi",
          mobileLabel: "Aksi",
          cell: (entry) => (
            <div className="cell-stack">
              <strong>{entry.action || "-"}</strong>
              <small>
                {entry.resourceType || "-"} | {entry.resourceId || "-"}
              </small>
            </div>
          )
        },
        {
          id: "actor",
          header: "Aktor",
          mobileLabel: "Aktor",
          cell: (entry) => (
            <div className="cell-stack">
              <code>{entry.actorUserId || "-"}</code>
              <small>{formatDateTime(entry.createdAt)}</small>
            </div>
          )
        },
        {
          id: "changes",
          header: "Perubahan",
          mobileLabel: "Perubahan",
          cell: (entry) => renderDiffSummary(entry.before, entry.after)
        }
      ]}
      detail={(entry) => <AuditDetail entry={entry} />}
    />
  );
}

type FilterState = Record<string, string>;

function ActivityPage<T>({
  storageKey,
  title,
  description,
  defaults,
  load,
  exportPath,
  filename,
  filters,
  query,
  getRowId,
  columns,
  detail,
  notify
}: {
  guildId: string;
  storageKey: string;
  title: string;
  description: string;
  defaults: FilterState;
  load: (query: string) => Promise<T[]>;
  exportPath: (query: string) => string;
  filename: (format: "csv" | "json") => string;
  filters: (state: FilterState, setState: (key: string, value: string) => void) => React.ReactNode;
  query: (state: FilterState) => string;
  getRowId: (entry: T, index: number) => string;
  columns: Array<DataTableColumn<T>>;
  detail: (entry: T) => React.ReactNode;
  notify: Notify;
}) {
  const storeKey = `conot:filters:v2:${storageKey}`;
  const [filterOpen, setFilterOpen] = useState(true);
  const [state, setState] = useState<FilterState>(() => {
    try {
      return { ...defaults, ...(JSON.parse(localStorage.getItem(storeKey) || "{}") as FilterState) };
    } catch {
      return defaults;
    }
  });
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [selected, setSelected] = useState<T | null>(null);
  const hasLoaded = useRef(false);

  const currentQuery = query(state);

  const reload = useCallback(async (options: ReloadOptions = {}) => {
    const silent = options.silent ?? hasLoaded.current;
    const started = performance.now();
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      setRows(await load(currentQuery));
      localStorage.setItem(storeKey, JSON.stringify(state));
      setUpdatedAt(new Date());
      hasLoaded.current = true;
    } catch (error) {
      notify("error", `Gagal memuat ${title}: ${getErrorMessage(error)}`);
    } finally {
      const remaining = 250 - (performance.now() - started);
      if (remaining > 0) await wait(remaining);
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentQuery, load, notify, state, storeKey, title]);

  useEffect(() => {
    void reload();
  }, [reload]);
  useAutoRefresh(!selected, reload, 60000);

  function setFilter(key: string, value: string) {
    setState((current) => ({ ...current, [key]: value }));
  }

  function applyPreset(value: string) {
    const range = getPresetDateRange(value);
    setState((current) => ({
      ...current,
      rangePreset: value,
      fromDate: range.fromDate,
      toDate: range.toDate
    }));
  }

  async function exportData(format: "csv" | "json") {
    const exportQuery = currentQuery
      ? `${currentQuery}&format=${format}`
      : `?format=${format}`;
    try {
      await api.download(exportPath(exportQuery), filename(format));
      notify("success", `Export ${format.toUpperCase()} dimulai.`);
    } catch (error) {
      notify("error", `Export gagal: ${getErrorMessage(error)}`);
    }
  }

  return (
    <div className="page-stack">
      <div className="activity-head">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="row-actions">
          <RefreshMeta updatedAt={updatedAt} refreshing={refreshing} />
          <FilterToggle open={filterOpen} onClick={() => setFilterOpen((value) => !value)} />
          <ActionMenu label={`Opsi ${title}`}>
            <ActionMenuItem onSelect={() => void reload({ silent: true })}>Refresh sekarang</ActionMenuItem>
          </ActionMenu>
          <ExportMenu onExport={(format) => void exportData(format)} />
        </div>
      </div>
      {filterOpen ? (
        <div className="toolbar surface">
          {filters(state, setFilter)}
          <TextField id={`${storageKey}-q`} label="Search" value={state.q || ""} onChange={(event) => setFilter("q", event.target.value)} />
          <TextField id={`${storageKey}-from`} label="Dari" type="date" value={state.fromDate || ""} onChange={(event) => setFilter("fromDate", event.target.value)} />
          <TextField id={`${storageKey}-to`} label="Sampai" type="date" value={state.toDate || ""} onChange={(event) => setFilter("toDate", event.target.value)} />
          <SelectField id={`${storageKey}-range`} label="Preset" value={state.rangePreset || ""} onChange={(event) => applyPreset(event.target.value)}>
            <option value="">Custom</option>
            <option value="24h">24 jam</option>
            <option value="3d">3 hari</option>
            <option value="7d">7 hari</option>
            <option value="30d">30 hari</option>
            <option value="all">Semua</option>
          </SelectField>
          <SelectField id={`${storageKey}-limit`} label="Limit" value={state.limit || "200"} onChange={(event) => setFilter("limit", event.target.value)}>
            <option value="100">100</option>
            <option value="150">150</option>
            <option value="200">200</option>
            <option value="300">300</option>
            <option value="500">500</option>
          </SelectField>
          <div className="toolbar-actions">
            <Button type="button" onClick={() => void reload()}>
              Apply
            </Button>
            <Button
              tone="secondary"
              type="button"
              onClick={() => {
                setState(defaults);
                localStorage.removeItem(storeKey);
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      ) : null}
      <DataTable
        data={rows}
        columns={columns}
        getRowId={getRowId}
        loading={loading}
        onRowClick={setSelected}
        empty={<EmptyState title="Tidak ada data" body="Coba ubah filter atau rentang waktu." />}
      />
      <Drawer open={Boolean(selected)} title={`${title} detail`} onClose={() => setSelected(null)}>
        {selected ? detail(selected) : null}
      </Drawer>
    </div>
  );
}

function DisabledNotice() {
  return (
    <Card className="notice-card">
      <Badge tone="warning">Read-only</Badge>
      <p>Aksi perubahan dinonaktifkan karena akun ini tidak memiliki MANAGE_GUILD pada guild ini.</p>
    </Card>
  );
}

function JsonDetail({ value }: { value: unknown }) {
  return <pre className="json-panel">{JSON.stringify(value, null, 2)}</pre>;
}

function AuditDetail({ entry }: { entry: AuditEntry }) {
  return <AuditDiffViewer entry={entry} />;
}

function AuditDiffViewer({ entry }: { entry: AuditEntry }) {
  const changes = getChangedKeys(entry.before, entry.after);
  return (
    <div className="stack">
      <div className="diff-chip-list" aria-label="Field berubah">
        {changes.length ? (
          changes.map((key) => (
            <span key={key} className="diff-chip">
              <code>{key}</code>
            </span>
          ))
        ) : (
          <span className="muted">Tidak ada field berubah.</span>
        )}
      </div>
      <div className="diff-grid">
        <section>
          <h3>Before</h3>
          <pre className="json-panel">{JSON.stringify(entry.before || null, null, 2)}</pre>
        </section>
        <section>
          <h3>After</h3>
          <pre className="json-panel">{JSON.stringify(entry.after || null, null, 2)}</pre>
        </section>
      </div>
      <JsonDetail value={entry} />
    </div>
  );
}

function renderDiffSummary(before?: Record<string, unknown> | null, after?: Record<string, unknown> | null) {
  const changes = getChangedKeys(before, after).slice(0, 4);
  if (!changes.length) return <span className="muted">Tidak ada diff.</span>;
  return (
    <div className="diff-summary">
      {changes.map((key) => (
        <span key={key}>
          <code>{key}</code> berubah
        </span>
      ))}
    </div>
  );
}

function getChangedKeys(before?: Record<string, unknown> | null, after?: Record<string, unknown> | null) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return Array.from(keys).filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
}

function compactJson(value: unknown) {
  const text = value == null ? "-" : JSON.stringify(value);
  if (!text) return "-";
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatUptime(value: number) {
  const uptime = Math.max(0, Math.floor(value || 0));
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  if (hours) return `${hours}j ${minutes}m`;
  return `${minutes}m ${uptime % 60}d`;
}
