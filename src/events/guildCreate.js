const { enforceGuildJoinPolicy } = require("../services/accessGuardService");

module.exports = {
  name: "guildCreate",
  async execute(guild) {
    await enforceGuildJoinPolicy(guild.client, guild);
  }
};
