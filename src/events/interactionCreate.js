const logger = require("../utils/logger");
const { sendGuildLog } = require("../services/botLogService");
const { consumeCommandRateLimit } = require("../services/commandRateLimitService");
const { evaluateAccess, isOwnerUser } = require("../services/accessGuardService");
const {
  buildAccessDeniedEmbed,
  buildCommandErrorEmbed,
  buildRateLimitEmbed,
  buildValidationErrorEmbed
} = require("../utils/embedFactory");

module.exports = {
  name: "interactionCreate",
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      return;
    }

    const access = await evaluateAccess({
      guildId: interaction.guildId,
      userId: interaction.user?.id
    });

    if (!access.allowed) {
      await interaction.reply({
        embeds: [buildAccessDeniedEmbed(access.reason)],
        ephemeral: true
      }).catch(() => null);
      return;
    }

    if (command.ownerOnly && !isOwnerUser(interaction.user?.id)) {
      await interaction.reply({
        embeds: [buildValidationErrorEmbed("Command ini hanya bisa digunakan oleh owner instance bot.")]
      }).catch(() => null);
      return;
    }

    const rateLimit = consumeCommandRateLimit({
      guildId: interaction.guildId,
      userId: interaction.user?.id,
      commandKey: command.data?.name || interaction.commandName,
      windowMs: command.rateLimitMs
    });

    if (!rateLimit.allowed) {
      await interaction.reply({
        embeds: [buildRateLimitEmbed(`/${interaction.commandName}`, rateLimit.retryAfterMs)],
        ephemeral: true
      }).catch(() => null);
      return;
    }

    if (command.rateLimitBucket && command.rateLimitBucketMs) {
      const bucketLimit = consumeCommandRateLimit({
        guildId: interaction.guildId,
        userId: interaction.user?.id,
        commandKey: `bucket:${command.rateLimitBucket}`,
        windowMs: command.rateLimitBucketMs
      });

      if (!bucketLimit.allowed) {
        await interaction.reply({
          embeds: [buildRateLimitEmbed(`/${interaction.commandName}`, bucketLimit.retryAfterMs)],
          ephemeral: true
        }).catch(() => null);
        return;
      }
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error(`Command /${interaction.commandName} gagal dijalankan.`, error);
      await sendGuildLog(interaction.client, {
        guildId: interaction.guildId,
        level: "error",
        scope: "Command",
        title: `Slash command /${interaction.commandName} gagal`,
        description: "Bot mengalami error saat menjalankan slash command.",
        details: [
          {
            name: "User",
            value: `${interaction.user?.tag || interaction.user?.id || "Unknown User"}`,
            inline: true
          },
          {
            name: "Guild",
            value: `${interaction.guild?.name || interaction.guildId || "Unknown Guild"}`,
            inline: true
          }
        ],
        error
      });

      const errorResponse = {
        embeds: [buildCommandErrorEmbed(`/${interaction.commandName}`)],
        ephemeral: true
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(errorResponse).catch(() => null);
        return;
      }

      await interaction.reply(errorResponse).catch(() => null);
    }
  }
};
