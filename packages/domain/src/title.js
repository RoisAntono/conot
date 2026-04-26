"use strict";

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAnyKeyword(title, keywords) {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) {
    return false;
  }

  const list = Array.isArray(keywords) ? keywords : [];
  return list.some((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    return normalizedKeyword && normalizedTitle.includes(normalizedKeyword);
  });
}

module.exports = {
  normalizeText,
  matchesAnyKeyword
};
