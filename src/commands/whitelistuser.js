const { SlashCommandBuilder } = require("discord.js");
const {
  OWNER_COMMAND_RATE_LIMIT_MS,
  SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS
} = require("../config/constants");
const {
  getAccessControl,
  getOwnerUserIds,
  unwhitelistUser,
  whitelistUser
} = require("../services/accessGuardService");
const { resolveGuildUser } = require("../utils/discordResolvers");
const {
  buildAccessGuardStatusEmbed,
  buildValidationErrorEmbed,
  buildWhitelistUpdatedEmbed
} = require("../utils/embedFactory");

function normalizeUserId(rawValue) {
  const value = String(rawValue || "").replace(/[<@!>]/g, "").trim();
  return /^\d{10,}$/.test(value) ? value : null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("whitelistuser")
    .setDescription("Tambah, hapus, atau lihat whitelist user untuk instance bot.")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Aksi yang ingin dilakukan")
        .addChoices(
          { name: "Add", value: "add" },
          { name: "Remove", value: "remove" },
          { name: "List", value: "list" }
        )
        .setRequired(true)
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User target")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("user_id")
        .setDescription("User ID target jika tidak bisa memilih lewat mention")
        .setRequired(false)
    ),
  prefix: {
    name: "whitelistuser",
    aliases: ["userwhitelist"],
    usage: "whitelistuser <add|remove|list> [@user|userId]"
  },
  ownerOnly: true,
  rateLimitMs: OWNER_COMMAND_RATE_LIMIT_MS,
  rateLimitBucket: "owner_guard",
  rateLimitBucketMs: SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const action = interaction.options.getString("action", true);
    const slashUser = interaction.options.getUser("user");
    const manualUserId = normalizeUserId(interaction.options.getString("user_id"));
    const userId = slashUser?.id || manualUserId || null;

    if (action === "list") {
      const accessControl = await getAccessControl();
      await interaction.editReply({
        embeds: [buildAccessGuardStatusEmbed(accessControl, getOwnerUserIds())]
      });
      return;
    }

    if (!userId) {
      await interaction.editReply({
        embeds: [buildValidationErrorEmbed("User target tidak valid.")]
      });
      return;
    }

    if (action === "add") {
      await whitelistUser(userId);
    } else {
      await unwhitelistUser(userId);
    }

    const accessControl = await getAccessControl();

    await interaction.editReply({
      embeds: [buildWhitelistUpdatedEmbed({ type: "user", action, targetId: userId, accessControl })]
    });
  },
  async executePrefix(message, args, context) {
    const action = String(args[0] || "").trim().toLowerCase();

    if (!action) {
      await message.reply({
        embeds: [buildValidationErrorEmbed(`Format: \`${context.prefix} ${this.prefix.usage}\``)]
      });
      return;
    }

    if (action === "list") {
      const accessControl = await getAccessControl();
      await message.reply({
        embeds: [buildAccessGuardStatusEmbed(accessControl, getOwnerUserIds())]
      });
      return;
    }

    if (!["add", "remove"].includes(action)) {
      await message.reply({
        embeds: [buildValidationErrorEmbed("Aksi tidak valid. Gunakan `add`, `remove`, atau `list`.")]
      });
      return;
    }

    const resolvedUser = await resolveGuildUser(message.guild, args[1]);
    const userId = resolvedUser?.id || normalizeUserId(args[1]);

    if (!userId) {
      await message.reply({
        embeds: [buildValidationErrorEmbed("User target tidak valid.")]
      });
      return;
    }

    if (action === "add") {
      await whitelistUser(userId);
    } else {
      await unwhitelistUser(userId);
    }

    const accessControl = await getAccessControl();

    await message.reply({
      embeds: [buildWhitelistUpdatedEmbed({ type: "user", action, targetId: userId, accessControl })]
    });
  }
};
