const { DEFAULT_EMBED_LAYOUT, EMBED_LAYOUTS } = require("../config/constants");

function normalizeEmbedLayout(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return DEFAULT_EMBED_LAYOUT;
  }

  if (Object.values(EMBED_LAYOUTS).includes(normalized)) {
    return normalized;
  }

  throw new Error("Layout embed tidak valid. Gunakan compact atau rich.");
}

function getEmbedLayoutLabel(value) {
  const layout = normalizeEmbedLayout(value);
  return layout === EMBED_LAYOUTS.RICH ? "Rich" : "Compact";
}

module.exports = {
  getEmbedLayoutLabel,
  normalizeEmbedLayout
};
