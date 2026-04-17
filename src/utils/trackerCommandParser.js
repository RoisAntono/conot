const { CONTENT_FILTERS, EMBED_LAYOUTS } = require("../config/constants");

function isChannelArgument(value) {
  return /^<#[0-9]+>$/.test(value || "") || /^\d{10,}$/.test(value || "");
}

function isRoleArgument(value) {
  return /^<@&[0-9]+>$/.test(value || "");
}

function isFilterArgument(value) {
  return Object.values(CONTENT_FILTERS).includes(String(value || "").toLowerCase());
}

function isLayoutArgument(value) {
  return Object.values(EMBED_LAYOUTS).includes(String(value || "").toLowerCase());
}

function parseTrackerCommandArgs(args) {
  const username = args[0];
  const parsed = {
    username: username || null,
    rawChannelArg: null,
    rawRoleArg: null,
    contentFilter: null,
    embedLayout: null,
    customMessage: undefined,
    titleFilter: undefined,
    clearTitleFilter: false,
    refreshSource: false
  };

  if (!username) {
    return parsed;
  }

  const rest = args.slice(1);
  const customMessageParts = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (token === "--title") {
      parsed.titleFilter = rest[index + 1] || null;
      index += 1;
      continue;
    }

    if (token === "--message") {
      parsed.customMessage = rest[index + 1] || null;
      index += 1;
      continue;
    }

    if (token === "--layout") {
      parsed.embedLayout = rest[index + 1] || null;
      index += 1;
      continue;
    }

    if (token === "--clear-title") {
      parsed.clearTitleFilter = true;
      continue;
    }

    if (token === "--refresh-source") {
      parsed.refreshSource = true;
      continue;
    }

    if (!parsed.rawChannelArg && isChannelArgument(token)) {
      parsed.rawChannelArg = token;
      continue;
    }

    if (!parsed.rawRoleArg && isRoleArgument(token)) {
      parsed.rawRoleArg = token;
      continue;
    }

    if (!parsed.contentFilter && isFilterArgument(token)) {
      parsed.contentFilter = token.toLowerCase();
      continue;
    }

    if (!parsed.embedLayout && isLayoutArgument(token)) {
      parsed.embedLayout = token.toLowerCase();
      continue;
    }

    customMessageParts.push(token);
  }

  if (!parsed.customMessage) {
    parsed.customMessage = customMessageParts.length ? customMessageParts.join(" ") : null;
  }

  return parsed;
}

module.exports = {
  parseTrackerCommandArgs
};
