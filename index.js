import express from "express";
import { Telegraf } from "telegraf";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./config/db.js";
import { setupBot } from "./bot/index.js";
import { setupDashboard } from "./dashboard/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.BOT_TOKEN || !process.env.DATABASE_URL) {
  console.error("❌ Missing BOT_TOKEN or DATABASE_URL");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
app.use(express.json());

// Setup bot + dashboard
setupBot(bot, pool);
setupDashboard(app, pool);

// Serve Telegram Mini App static files
app.use("/webapp", express.static(path.join(__dirname, "webapp")));

// Webhook configuration
const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = "/webhook";
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || "https://linktory.onrender.com";
const webhookUrl = `${RENDER_URL}${WEBHOOK_PATH}`;

app.use(bot.webhookCallback(WEBHOOK_PATH));

(async () => {
  try {
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`✅ Webhook set to: ${webhookUrl}`);
  } catch (err) {
    console.error("❌ Failed to set webhook:", err);
  }
})();

app.get("/", (req, res) => res.send("🚀 Linktory Bot is live via webhook mode!"));
app.listen(PORT, () => console.log(`⚡ Server running on port ${PORT}`));
