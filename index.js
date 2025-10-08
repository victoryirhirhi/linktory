// index.js
import express from "express";
import { Telegraf } from "telegraf";
import { pool } from "./config/db.js";
import { setupBot } from "./bot/index.js";

if (!process.env.BOT_TOKEN || !process.env.RENDER_EXTERNAL_URL) {
  console.error("❌ Missing BOT_TOKEN or RENDER_EXTERNAL_URL environment variable.");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
setupBot(bot, pool);

const app = express();
app.use(express.json());
app.use(bot.webhookCallback("/webhook"));

// Set webhook dynamically on startup
const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/webhook`;

bot.telegram.setWebhook(webhookUrl)
  .then(() => console.log(`✅ Webhook set to: ${webhookUrl}`))
  .catch(err => console.error("❌ Error setting webhook:", err));

// Basic health endpoint
app.get("/", (req, res) => {
  res.send("🤖 Linktory Bot is active!");
});

// Listen on Render-assigned port
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
  console.log("🚀 Linktory Bot is running with Webhook mode...");
});
