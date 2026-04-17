const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
  "#39": "'"
};

function decodeEntity(entity) {
  const normalized = String(entity || "").trim();

  if (!normalized) {
    return "";
  }

  if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, normalized)) {
    return NAMED_ENTITIES[normalized];
  }

  if (/^#x[0-9a-f]+$/i.test(normalized)) {
    return String.fromCodePoint(parseInt(normalized.slice(2), 16));
  }

  if (/^#[0-9]+$/.test(normalized)) {
    return String.fromCodePoint(parseInt(normalized.slice(1), 10));
  }

  return `&${normalized};`;
}

function decodeHtmlEntities(value) {
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => decodeEntity(entity));
}

module.exports = {
  decodeHtmlEntities
};
