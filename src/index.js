const fs = require("node:fs");
const path = require("node:path");
const {
  Client,
  Collection,
  GatewayIntentBits
} = require("discord.js");
const { broadcastGlobalLog } = require("./services/botLogService");
const { stopCanaryScheduler } = require("./services/canaryService");
const { stopDataBackupScheduler } = require("./services/dataBackupService");
const { stopYouTubePoller } = require("./services/youtubePoller");
const { validateEnvironmentVariables } = require("./utils/envValidator");
const { ensureDataFile, readData } = require("./utils/fileDb");
const logger = require("./utils/logger");

let runtimeClient = null;
let isShuttingDown = false;

function validateEnvironment() {
  validateEnvironmentVariables(process.env);
}

function loadCommands(client) {
  const commandsPath = path.join(__dirname, "commands");
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command?.data && command?.execute) {
      client.commands.set(command.data.name, command);
    }

    if (command?.prefix?.name && command?.executePrefix) {
      client.prefixCommands.set(command.prefix.name, command);

      for (const alias of command.prefix.aliases || []) {
        client.prefixCommands.set(alias, command);
      }
    }
  }
}

function loadEvents(client) {
  const eventsPath = path.join(__dirname, "events");
  const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));

  for (const file of eventFiles) {
    const event = require(path.join(eventsPath, file));
    const handler = (...args) => event.execute(...args);

    if (event.once) {
      client.once(event.name, handler);
    } else {
      client.on(event.name, handler);
    }
  }
}

async function bootstrap() {
  validateEnvironment();
  await ensureDataFile();
  await readData();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.commands = new Collection();
  client.prefixCommands = new Collection();
  runtimeClient = client;

  loadCommands(client);
  loadEvents(client);

  await client.login(process.env.DISCORD_TOKEN);
}

async function shutdownGracefully(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.warn(`Menerima sinyal ${signal}. Memulai graceful shutdown...`);

  stopCanaryScheduler();
  stopDataBackupScheduler();
  stopYouTubePoller();

  await broadcastGlobalLog({
    level: "warn",
    scope: "Runtime",
    title: "Graceful Shutdown",
    description: `Bot menerima sinyal ${signal} dan sedang menghentikan proses secara aman.`,
    logSignature: `runtime-shutdown:${signal}:${new Date().toISOString().slice(0, 16)}`
  }).catch(() => null);

  if (runtimeClient) {
    try {
      runtimeClient.destroy();
    } catch (error) {
      logger.warn("Gagal destroy discord client saat shutdown.", error);
    }
  }

  setTimeout(() => {
    process.exit(0);
  }, 500);
}

process.on("unhandledRejection", async (reason) => {
  logger.error("Unhandled promise rejection.", reason);
  await broadcastGlobalLog({
    level: "error",
    scope: "Runtime",
    title: "Unhandled Promise Rejection",
    description: "Bot menangkap unhandled promise rejection pada level proses.",
    error: reason instanceof Error ? reason : new Error(String(reason))
  }).catch(() => null);
});

process.on("uncaughtException", async (error) => {
  logger.error("Uncaught exception.", error);
  await broadcastGlobalLog({
    level: "error",
    scope: "Runtime",
    title: "Uncaught Exception",
    description: "Bot menangkap uncaught exception pada level proses.",
    error
  }).catch(() => null);
});

bootstrap().catch((error) => {
  logger.error("Bot gagal dijalankan.", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  shutdownGracefully("SIGINT").catch(() => null);
});

process.on("SIGTERM", () => {
  shutdownGracefully("SIGTERM").catch(() => null);
});
