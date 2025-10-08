// index.js
import { Telegraf } from "telegraf";
import { pool } from "./config/db.js";
import { setupBot } from "./bot/index.js";

if (!process.env.BOT_TOKEN || !process.env.DATABASE_URL) {
  console.error("❌ Missing BOT_TOKEN or DATABASE_URL environment variables.");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
setupBot(bot, pool);

bot.launch();
console.log("🤖 Linktory Bot is running...");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
