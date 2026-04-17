const logger = require("../utils/logger");
const { evaluateAccess, isOwnerUser } = require("../services/accessGuardService");
const { sendGuildLog } = require("../services/botLogService");
const { consumeCommandRateLimit } = require("../services/commandRateLimitService");
const { getPrefixForGuild } = require("../services/prefixService");
const {
  buildAccessDeniedEmbed,
  buildCommandErrorEmbed,
  buildRateLimitEmbed,
  buildValidationErrorEmbed
} = require("../utils/embedFactory");
const { parsePrefixedMessage } = require("../utils/prefixParser");

module.exports = {
  name: "messageCreate",
  async execute(message) {
    if (!message.guild || message.author.bot) {
      return;
    }

    const prefix = await getPrefixForGuild(message.guild.id);
    const parsed = parsePrefixedMessage(message.content, prefix);

    if (!parsed) {
      return;
    }

    const command = message.client.prefixCommands.get(parsed.commandName);
    if (!command?.executePrefix) {
      return;
    }

    const access = await evaluateAccess({
      guildId: message.guild.id,
      userId: message.author?.id
    });

    if (!access.allowed) {
      if (access.reason === "guild_not_whitelisted") {
        return;
      }

      await message.reply({
        embeds: [buildAccessDeniedEmbed(access.reason)]
      });
      return;
    }

    if (command.ownerOnly && !isOwnerUser(message.author?.id)) {
      await message.reply({
        embeds: [buildValidationErrorEmbed("Command ini hanya bisa digunakan oleh owner instance bot.")]
      });
      return;
    }

    if (command.requiredPermissions && !message.member.permissions.has(command.requiredPermissions)) {
      await message.reply({
        embeds: [buildValidationErrorEmbed("Kamu tidak punya permission untuk menjalankan command ini.")]
      });
      return;
    }

    const rateLimit = consumeCommandRateLimit({
      guildId: message.guild.id,
      userId: message.author?.id,
      commandKey: command.data?.name || command.prefix?.name || parsed.commandName,
      windowMs: command.rateLimitMs
    });

    if (!rateLimit.allowed) {
      await message.reply({
        embeds: [buildRateLimitEmbed(`${prefix} ${parsed.commandName}`, rateLimit.retryAfterMs)]
      });
      return;
    }

    if (command.rateLimitBucket && command.rateLimitBucketMs) {
      const bucketLimit = consumeCommandRateLimit({
        guildId: message.guild.id,
        userId: message.author?.id,
        commandKey: `bucket:${command.rateLimitBucket}`,
        windowMs: command.rateLimitBucketMs
      });

      if (!bucketLimit.allowed) {
        await message.reply({
          embeds: [buildRateLimitEmbed(`${prefix} ${parsed.commandName}`, bucketLimit.retryAfterMs)]
        });
        return;
      }
    }

    try {
      await command.executePrefix(message, parsed.args, { prefix });
    } catch (error) {
      logger.error(`Prefix command ${parsed.commandName} gagal dijalankan.`, error);
      await sendGuildLog(message.client, {
        guildId: message.guild.id,
        level: "error",
        scope: "Command",
        title: `Prefix command ${prefix} ${parsed.commandName} gagal`,
        description: "Bot mengalami error saat menjalankan prefix command.",
        details: [
          {
            name: "User",
            value: `${message.author?.tag || message.author?.id || "Unknown User"}`,
            inline: true
          },
          {
            name: "Guild",
            value: `${message.guild?.name || message.guild?.id || "Unknown Guild"}`,
            inline: true
          }
        ],
        error
      });
      await message.reply({
        embeds: [buildCommandErrorEmbed(`${prefix} ${parsed.commandName}`)]
      }).catch(() => null);
    }
  }
};
