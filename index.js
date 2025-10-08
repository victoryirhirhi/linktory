import express from "express";
import { Telegraf } from "telegraf";
import { pool } from "./config/db.js";
import { setupBot } from "./bot/index.js";

// Ensure required environment variables
if (!process.env.BOT_TOKEN || !process.env.DATABASE_URL) {
  console.error("❌ Missing BOT_TOKEN or DATABASE_URL in environment variables.");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
setupBot(bot, pool);

// Create Express server to keep bot alive on Render
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("✅ Linktory Bot is Alive!"));

// Start bot and server
bot.launch();
app.listen(PORT, () => console.log(`🌍 Server running on port ${PORT}`));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
