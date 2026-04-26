import type { DiscordChannel, DiscordRole, Guild, User } from "./types";

export function getInitial(value: string | undefined | null) {
  const normalized = String(value || "").trim();
  return (normalized[0] || "?").toUpperCase();
}

export function getUserName(user?: User | null) {
  return user?.username || user?.id || "Unknown User";
}

export function getDiscordAvatarUrl(user?: User | null, size = 80) {
  if (!user?.id) return null;
  if (user.avatar) {
    const ext = String(user.avatar).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${encodeURIComponent(user.id)}/${encodeURIComponent(
      user.avatar
    )}.${ext}?size=${size}`;
  }

  const index = getDefaultAvatarIndex(user);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export function getDiscordGuildIconUrl(guild?: Guild | null, size = 128) {
  const iconHash = guild?.icon || guild?.botIcon || null;
  if (!guild?.id || !iconHash) return null;
  return `https://cdn.discordapp.com/icons/${encodeURIComponent(guild.id)}/${encodeURIComponent(
    iconHash
  )}.png?size=${size}`;
}

function getDefaultAvatarIndex(user: User) {
  if (!user.id) return 0;
  if (user.discriminator && String(user.discriminator) !== "0") {
    return Number(user.discriminator) % 5;
  }
  try {
    return Number((BigInt(user.id) >> 22n) % 6n);
  } catch {
    return 0;
  }
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function formatRelativeTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}d lalu`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}j lalu`;
  return `${Math.floor(diffHour / 24)}h lalu`;
}

export function formatDateInput(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getPresetDateRange(preset: string) {
  const now = new Date();
  const toDate = formatDateInput(now);
  const days: Record<string, number> = {
    "24h": 1,
    "3d": 3,
    "7d": 7,
    "30d": 30
  };
  if (!days[preset]) {
    return { fromDate: "", toDate: "" };
  }
  return {
    fromDate: formatDateInput(new Date(Date.now() - days[preset] * 24 * 60 * 60 * 1000)),
    toDate
  };
}

export function toIsoFromDateInput(value: string, endOfDay = false) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(`${raw}${endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function formatDateForFilename() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${y}${m}${d}-${hh}${mm}`;
}

export function channelLabel(channelId?: string | null, channels: DiscordChannel[] = []) {
  const channel = channels.find((item) => item.id === channelId);
  return channel ? `#${channel.name}` : channelId ? `#${channelId}` : "Belum dipilih";
}

export function roleLabel(roleId?: string | null, roles: DiscordRole[] = []) {
  const role = roles.find((item) => item.id === roleId);
  return role ? `@${role.name}` : roleId ? `@${roleId}` : "Tanpa role";
}

export function renderCustomMessageTemplate(template: string, sampleTitle = "Nama Channel") {
  const source = template.trim() || "Ada video baru dari {channel}! {title} - {link}";
  return source
    .replaceAll("{channel}", sampleTitle || "Nama Channel")
    .replaceAll("{title}", "Judul Video Contoh")
    .replaceAll("{link}", "https://www.youtube.com/watch?v=example123")
    .replaceAll("{type}", "[VIDEO]");
}

export function getFieldErrors(error: unknown) {
  const maybe = error as {
    payload?: { error?: { details?: { fields?: Array<{ field: string; message: string }> } } };
  };
  return (maybe.payload?.error?.details?.fields || []).reduce<Record<string, string>>((acc, item) => {
    if (item.field && item.message) acc[item.field] = item.message;
    return acc;
  }, {});
}

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function queryFromRecord(record: Record<string, string | undefined | null>) {
  const query = new URLSearchParams();
  Object.entries(record).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}
