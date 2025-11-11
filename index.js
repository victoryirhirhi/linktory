import express from "express";
import { Telegraf } from "telegraf";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { pool } from "./config/db.js";
import { setupBot } from "./bot/index.js";
import { setupDashboard } from "./dashboard/index.js";
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

// Setup bot + dashboard
setupBot(bot, pool);
setupDashboard(app, pool);

// ✅ API routes connected for mini app
app.use("/api", apiRoutes);

// ✅ Serve static Telegram Mini App files
app.use("/webapp", express.static(path.join(__dirname, "webapp")));

// ✅ JWT session endpoint for Mini App auto-login
app.get("/api/sessionFromToken", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.json({ ok: false });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const telegram_id = decoded.telegram_id;

    const userRes = await pool.query(
      "SELECT telegram_id, username FROM users WHERE telegram_id=$1",
      [telegram_id]
    );
    if (userRes.rows.length === 0) return res.json({ ok: false });

    res.json({ ok: true, telegram_id, username: userRes.rows[0].username });
  } catch (e) {
    console.error("sessionFromToken error:", e);
    res.json({ ok: false });
  }
});

const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = "/webhook";
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `https://linktory.onrender.com`;
const webhookUrl = `${RENDER_URL}${WEBHOOK_PATH}`;

// ✅ Webhook endpoint
app.use(bot.webhookCallback(WEBHOOK_PATH));

// Root route
app.get("/", (req, res) => {
  res.send("🚀 Linktory Bot + Mini App running in Webhook Mode!");
});

// ✅ Start the server first, THEN set the webhook
app.listen(PORT, async () => {
  console.log(`⚡ Server running on port ${PORT}`);

  try {
    // clear old webhooks first
    await bot.telegram.deleteWebhook();
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`✅ Webhook set to: ${webhookUrl}`);
  } catch (err) {
    console.error("❌ Failed to set webhook:", err.response?.description || err.message);
  }
});
