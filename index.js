// Force Node.js to prefer IPv4 over IPv6
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");


import { Telegraf } from "telegraf";
import express from "express";
import pkg from "pg";

const { Pool } = pkg;

// === DB Connection ===
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  host: "db.lkdblvkkupbelhsoaeia.supabase.co", // force IPv4
  port: 5432
});

// === Init Bot ===
const bot = new Telegraf(process.env.BOT_TOKEN);

// /start
bot.start(async (ctx) => {
  try {
    const userId = ctx.from.id;
    const username = ctx.from.username || "unknown";

    await pool.query(
      "INSERT INTO users (telegram_id, username, points, trust_score) VALUES ($1, $2, 0, 100) ON CONFLICT (telegram_id) DO NOTHING",
      [userId, username]
    );

    ctx.reply("🚀 Welcome to Linktory!\n\nUse /add <link> to submit a link and earn points.");
  } catch (err) {
    console.error("DB error on /start:", err.message);
    ctx.reply("⚠️ Welcome to Linktory! (Database temporarily unavailable)");
  }
});

// /add <link>
bot.command("add", async (ctx) => {
  try {
    const parts = ctx.message.text.split(" ");
    const link = parts[1];

    if (!link) return ctx.reply("⚠️ Usage: /add <link>");

    const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
    if (rows.length > 0) {
      return ctx.reply("❌ This link already exists in Linktory.");
    }

    await pool.query(
      "INSERT INTO links (url, submitted_by, status) VALUES ($1, $2, 'pending')",
      [link, ctx.from.id]
    );
    await pool.query(
      "UPDATE users SET points = points + 10 WHERE telegram_id=$1",
      [ctx.from.id]
    );

    ctx.reply(`✅ Link added: ${link}\n+10 points earned!`);
  } catch (err) {
    console.error("DB error on /add:", err.message);
    ctx.reply("⚠️ Could not add link (DB error). Try again later.");
  }
});

// /report <link_id> <reason>
bot.command("report", async (ctx) => {
  try {
    const parts = ctx.message.text.split(" ");
    const linkId = parts[1];
    const reason = parts.slice(2).join(" ") || "No reason";

    if (!linkId) return ctx.reply("⚠️ Usage: /report <link_id> <reason>");

    await pool.query(
      "INSERT INTO reports (link_id, reported_by, reason) VALUES ($1, $2, $3)",
      [linkId, ctx.from.id, reason]
    );

    ctx.reply(`⚠️ Report submitted for link #${linkId}.\nReason: ${reason}`);
  } catch (err) {
    console.error("DB error on /report:", err.message);
    ctx.reply("⚠️ Could not submit report (DB error). Try again later.");
  }
});

// /check <link>
bot.command("check", async (ctx) => {
  try {
    const parts = ctx.message.text.split(" ");
    const link = parts[1];

    if (!link) return ctx.reply("⚠️ Usage: /check <link>");

    const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);

    if (rows.length === 0) {
      return ctx.reply("❌ No record found. Add it with /add <link>");
    }

    ctx.reply(`ℹ️ Link found:\nID: ${rows[0].id}\nStatus: ${rows[0].status}`);
  } catch (err) {
    console.error("DB error on /check:", err.message);
    ctx.reply("⚠️ Could not check link (DB error). Try again later.");
  }
});

// /leaderboard
bot.command("leaderboard", async (ctx) => {
  try {
    const { rows } = await pool.query(
      "SELECT username, points FROM users ORDER BY points DESC LIMIT 10"
    );

    let message = "🏆 Top Contributors:\n\n";
    rows.forEach((u, i) => {
      message += `${i + 1}. ${u.username} — ${u.points} pts\n`;
    });

    ctx.reply(message);
  } catch (err) {
    console.error("DB error on /leaderboard:", err.message);
    ctx.reply("⚠️ Could not load leaderboard (DB error). Try again later.");
  }
});

// === Webhook Setup ===
const app = express();
app.use(bot.webhookCallback("/webhook"));

// Health checks
app.get("/", (req, res) => res.send("✅ Linktory bot is running!"));
app.get("/health", async (req, res) => {
  try {
    const dbCheck = await pool.query("SELECT NOW()");
    res.json({ status: "ok", db_time: dbCheck.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// === Server Start ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  const url = process.env.RENDER_EXTERNAL_URL;
  if (url) {
    await bot.telegram.setWebhook(`${url}/webhook`);
    console.log(`✅ Webhook set to ${url}/webhook`);
  }
});

