import express from "express";
import { Telegraf } from "telegraf";
import { pool } from "./config/db.js";
import { setupBot } from "./bot/index.js";
import { setupDashboard } from "./dashboard/index.js";

if (!process.env.BOT_TOKEN || !process.env.DATABASE_URL) {
  console.error("❌ Missing BOT_TOKEN or DATABASE_URL");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
setupBot(bot, pool);

const app = express();
app.use(express.json());

// Webhook route
const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = "/webhook";
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `https://linktory.onrender.com`;
const webhookUrl = `${RENDER_URL}${WEBHOOK_PATH}`;

app.use(bot.webhookCallback(WEBHOOK_PATH));

// Setup dashboard routes
setupDashboard(app, pool);

// Set webhook dynamically
(async () => {
  await bot.telegram.setWebhook(webhookUrl);
  console.log(`✅ Webhook set to: ${webhookUrl}`);
})();

app.get("/", (req, res) => {
  res.send("🚀 Linktory Bot is live via webhook mode!");
});

app.listen(PORT, () => console.log(`⚡ Server running on port ${PORT}`));
