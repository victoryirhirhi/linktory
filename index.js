import express from "express";
import cookieParser from "cookie-parser";
import { Telegraf } from "telegraf";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { pool } from "./config/db.js";
import { setupBot } from "./bot/index.js";
import apiRoutes from "./routes/api.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.BOT_TOKEN || !process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  console.error("❌ Missing BOT_TOKEN or DATABASE_URL or JWT_SECRET in env");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
app.use(express.json());
app.use(cookieParser());

// Setup bot (handlers) - optional additional setup inside ./bot
setupBot(bot, pool);

// Serve webapp static files
app.use("/webapp", express.static(path.join(__dirname, "webapp")));

// Mount API routes
app.use("/api", apiRoutes);

// Webhook config (mount webhook middleware on /webhook)
const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = "/webhook";
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
const webhookUrl = `${RENDER_URL}${WEBHOOK_PATH}`;

app.use(WEBHOOK_PATH, bot.webhookCallback(WEBHOOK_PATH));

(async () => {
  try {
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`✅ Webhook set to: ${webhookUrl}`);
  } catch (err) {
    console.error("❌ Failed to set webhook:", err?.description || err);
  }
})();

app.get("/", (req, res) => res.send("🚀 Linktory Bot + Mini App running in Webhook Mode!"));

app.listen(PORT, () => console.log(`⚡ Server running on port ${PORT}`));
