const { buildTitleWatchNotificationEmbed } = require("./embedFactory");

function buildDefaultMessageText(watch, options = {}) {
  if (options.messageText) {
    return options.messageText;
  }

  return `Keyword \`${watch.keyword}\` ditemukan pada judul video baru.`;
}

function formatTitleWatchNotification(watch, trackedChannel, latestVideo, options = {}) {
  const roleMention = !options.suppressRoleMention && watch.roleId ? `<@&${watch.roleId}>` : null;
  const content = [options.contentPrefix || null, buildDefaultMessageText(watch, options), roleMention]
    .filter(Boolean)
    .join("\n");

  return {
    content,
    embeds: [
      buildTitleWatchNotificationEmbed({
        watch,
        trackedChannel,
        latestVideo
      })
    ],
    allowedMentions: !options.suppressRoleMention && watch.roleId
      ? { roles: [watch.roleId] }
      : { parse: [] }
  };
}

module.exports = {
  formatTitleWatchNotification
};
