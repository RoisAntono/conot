const CONTENT_FILTERS = __CONOT_CONTENT_FILTERS__;
const EMBED_LAYOUTS = __CONOT_EMBED_LAYOUTS__;
const LOG_LEVELS = __CONOT_LOG_LEVELS__;

export const contentFilterOptions = CONTENT_FILTERS.map((value) => {
  const labels: Record<string, string> = {
    all: "Semua konten",
    video: "Video panjang / upload",
    shorts: "Shorts",
    live: "Semua live",
    live_upcoming: "Live akan datang",
    live_now: "Sedang live",
    live_replay: "Replay live",
    premiere: "Semua premiere",
    premiere_upcoming: "Premiere akan datang",
    premiere_published: "Premiere sudah tayang"
  };
  return {
    value,
    label: labels[value] || value
  };
});

export const embedLayoutOptions = EMBED_LAYOUTS.map((value) => ({
  value,
  label: value === "rich" ? "Rich" : "Compact"
}));

export const logLevelOptions = LOG_LEVELS.map((value) => ({
  value,
  label: value
}));

export const sections = [
  { key: "overview", label: "Overview", path: "" },
  { key: "trackers", label: "Trackers", path: "trackers" },
  { key: "title-watches", label: "Title Watches", path: "title-watches" },
  { key: "settings", label: "Settings", path: "settings" },
  { key: "health", label: "Health", path: "health" },
  { key: "notifications", label: "Notifications", path: "notifications" },
  { key: "logs", label: "Logs", path: "logs" },
  { key: "audit", label: "Audit", path: "audit" }
] as const;

export type SectionKey = (typeof sections)[number]["key"];

export function normalizeSection(section: string | undefined): SectionKey {
  const normalized = String(section || "overview").trim().toLowerCase();
  return sections.some((item) => item.key === normalized) ? (normalized as SectionKey) : "overview";
}
