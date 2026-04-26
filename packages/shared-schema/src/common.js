"use strict";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function validate(requiredMap, payload) {
  const errors = [];
  for (const [key, validator] of Object.entries(requiredMap)) {
    const message = validator(payload[key], payload);
    if (message) {
      errors.push({ field: key, message });
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

module.exports = {
  isNonEmptyString,
  normalizeString,
  toArray,
  validate
};
