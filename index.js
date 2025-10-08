import { Telegraf } from "telegraf";
import { pool } from "./config/db.js";
import { setupBot } from "./bot/index.js";

// Ensure environment variables exist (Render injects them automatically)
if (!process.env.BOT_TOKEN || !process.env.DATABASE_URL) {
  console.error("❌ Missing BOT_TOKEN or DATABASE_URL in environment variables.");
  process.exit(1);
}

// Initialize the bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Load all commands
setupBot(bot, pool);

// Launch bot
bot.launch();
console.log("🚀 Linktory Bot is running...");

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
