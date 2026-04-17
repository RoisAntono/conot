const {
  getTitleWatchesByGuild,
  removeTitleWatch,
  upsertTitleWatch
} = require("../utils/fileDb");
const {
  DEFAULT_TITLE_WATCH_MAX_AGE_DAYS,
  MAX_TITLE_WATCH_MAX_AGE_DAYS,
  MAX_TITLE_WATCHES_PER_GUILD
} = require("../config/constants");

class TitleWatchValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "TitleWatchValidationError";
    this.isValidationError = true;
  }
}

function normalizeTitleWatchKeyword(keyword) {
  const normalized = String(keyword || "").trim();
  if (!normalized) {
    throw new Error("Keyword title watch tidak boleh kosong.");
  }

  return normalized;
}

function normalizeTitleWatchMaxAgeDays(maxAgeDays) {
  if (maxAgeDays === undefined || maxAgeDays === null || maxAgeDays === "") {
    return DEFAULT_TITLE_WATCH_MAX_AGE_DAYS;
  }

  const normalized = Number(maxAgeDays);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > MAX_TITLE_WATCH_MAX_AGE_DAYS) {
    throw new Error(`Batas umur title watch harus angka 1 sampai ${MAX_TITLE_WATCH_MAX_AGE_DAYS} hari.`);
  }

  return normalized;
}

async function addTitleWatch({ guildId, keyword, channelId, roleId, maxAgeDays }) {
  const normalizedKeyword = normalizeTitleWatchKeyword(keyword);
  const existingWatches = await getTitleWatchesByGuild(guildId);
  const existingWatch = existingWatches.find((item) => item.keyword.toLowerCase() === normalizedKeyword.toLowerCase());

  if (!existingWatch && existingWatches.length >= MAX_TITLE_WATCHES_PER_GUILD) {
    throw new TitleWatchValidationError(
      `Batas title watch server tercapai (${MAX_TITLE_WATCHES_PER_GUILD}). Hapus watch lama atau naikkan limit instance.`
    );
  }

  return upsertTitleWatch(guildId, {
    keyword: normalizedKeyword,
    channelId,
    roleId: roleId || null,
    maxAgeDays: normalizeTitleWatchMaxAgeDays(maxAgeDays)
  });
}

async function deleteTitleWatch(guildId, keyword) {
  return removeTitleWatch(guildId, normalizeTitleWatchKeyword(keyword));
}

async function listTitleWatches(guildId) {
  return getTitleWatchesByGuild(guildId);
}

module.exports = {
  addTitleWatch,
  deleteTitleWatch,
  listTitleWatches,
  TitleWatchValidationError,
  normalizeTitleWatchMaxAgeDays,
  normalizeTitleWatchKeyword
};
