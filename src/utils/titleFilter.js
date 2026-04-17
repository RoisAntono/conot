const { matchesKeyword } = require("./titleMatcher");

function normalizeTitleFilters(value) {
  if (Array.isArray(value)) {
    const normalizedArray = value
      .map((item) => String(item || "").trim())
      .filter(Boolean);

    return [...new Set(normalizedArray)];
  }

  const normalized = String(value || "").trim();
  if (!normalized) {
    return [];
  }

  const parts = normalized
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return [...new Set(parts)];
}

function passesTitleFilter(titleFilters, latestVideo) {
  const normalizedFilters = normalizeTitleFilters(titleFilters);

  if (!normalizedFilters.length) {
    return true;
  }

  const title = String(latestVideo?.title || "");
  return normalizedFilters.some((keyword) => matchesKeyword(keyword, title));
}

function getTitleFilterLabel(titleFilters) {
  const normalizedFilters = normalizeTitleFilters(titleFilters);
  return normalizedFilters.length ? normalizedFilters.join(", ") : "Semua Judul";
}

module.exports = {
  getTitleFilterLabel,
  normalizeTitleFilters,
  passesTitleFilter
};
