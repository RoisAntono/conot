function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesKeyword(keyword, title) {
  const normalizedKeyword = normalizeSearchText(keyword);
  const normalizedTitle = normalizeSearchText(title);

  if (!normalizedKeyword || !normalizedTitle) {
    return false;
  }

  return normalizedTitle.includes(normalizedKeyword);
}

module.exports = {
  matchesKeyword,
  normalizeSearchText
};
