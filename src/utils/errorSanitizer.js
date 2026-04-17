function redactPathLikeTokens(value) {
  const text = String(value || "");

  if (!text) {
    return "";
  }

  return text
    .replace(/[a-zA-Z]:\\[^\s)\]}]+/g, "[redacted-path]")
    .replace(/\/(?:Users|home|var|opt|srv|mnt|tmp|private|root)\/[^\s)\]}]+/g, "[redacted-path]");
}

function sanitizeExternalError(error) {
  if (!error) {
    return null;
  }

  const raw = error instanceof Error
    ? (error.stack || error.message || "")
    : String(error);

  return redactPathLikeTokens(raw);
}

module.exports = {
  redactPathLikeTokens,
  sanitizeExternalError
};
