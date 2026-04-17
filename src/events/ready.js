const { registerSlashCommands } = require("../services/commandRegistry");
const { startCanaryScheduler } = require("../services/canaryService");
const { startDataBackupScheduler } = require("../services/dataBackupService");
const { enforceGuildWhitelistForClient } = require("../services/accessGuardService");
const { bindBotLogClient } = require("../services/botLogService");
const { startYouTubePoller } = require("../services/youtubePoller");
const logger = require("../utils/logger");

module.exports = {
  name: "ready",
  once: true,
  async execute(client) {
    logger.info(`Bot login sebagai ${client.user.tag}.`);
    bindBotLogClient(client);
    await enforceGuildWhitelistForClient(client);

    try {
      await registerSlashCommands(client);
    } catch (error) {
      logger.error("Gagal registrasi slash command.", error);
    }

    startYouTubePoller(client);
    startDataBackupScheduler();
    startCanaryScheduler();
  }
};
