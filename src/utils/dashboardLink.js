function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  return raw.replace(/\/+$/, "");
}

function getDashboardOrigin() {
  return normalizeOrigin(process.env.DASHBOARD_PUBLIC_URL || process.env.DASHBOARD_WEB_ORIGIN);
}

function buildGuildDashboardUrl(guildId, section = null) {
  const origin = getDashboardOrigin();
  const normalizedGuildId = String(guildId || "").trim();

  if (!origin || !normalizedGuildId) {
    return null;
  }

  const base = `${origin}/dashboard/${encodeURIComponent(normalizedGuildId)}`;
  const normalizedSection = String(section || "").trim().toLowerCase();

  if (!normalizedSection || normalizedSection === "overview") {
    return base;
  }

  return `${base}/${encodeURIComponent(normalizedSection)}`;
}

module.exports = {
  buildGuildDashboardUrl,
  getDashboardOrigin
};
