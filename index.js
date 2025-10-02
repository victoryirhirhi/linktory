import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import { Telegraf } from "telegraf";
import express from "express";
import pkg from "pg";
import crypto from "crypto";

const { Pool } = pkg;

// === DB Connection ===
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  host: "db.lkdblvkkupbelhsoaeia.supabase.co",
  port: 5432
});

// === Init Bot ===
const bot = new Telegraf(process.env.BOT_TOKEN);

// === Helpers ===
function generateHiddenId() {
  return crypto.randomBytes(4).toString("hex"); // 8-char hex
}

function generatePublicId() {
  return crypto.randomBytes(3).toString("hex"); // 6-char hex
}

// === /start Command ===
bot.start(async (ctx) => {
  try {
    const userId = ctx.from.id;
    const username = ctx.from.username || "unknown";
    const parts = ctx.message.text.split(" ");
    const refCode = parts[1];

    let referrerId = null;
    if (refCode) {
      const { rows } = await pool.query(
        "SELECT telegram_id FROM users WHERE referral_code=$1",
        [refCode]
      );
      if (rows.length > 0) referrerId = rows[0].telegram_id;
    }

    const referralCode = crypto.randomBytes(3).toString("hex");

    await pool.query(
      `INSERT INTO users (telegram_id, username, points, trust_score, referrer_id, referral_code)
       VALUES ($1, $2, 0, 100, $3, $4)
       ON CONFLICT (telegram_id) DO NOTHING`,
      [userId, username, referrerId, referralCode]
    );

    if (referrerId) {
      await pool.query(
        "UPDATE users SET points = points + 20 WHERE telegram_id=$1",
        [referrerId]
      );
      ctx.reply("🎉 You were referred! Referrer earned 20 points!");
    }

    ctx.reply(
      "🚀 Welcome to Linktory!\n\nUse /add <link> to submit a link and earn points.\n" +
      "Use /referral to get your referral code.\nUse /help to see all commands."
    );
  } catch (err) {
    console.error("DB error on /start:", err.message);
    ctx.reply("⚠️ Welcome to Linktory! (Database temporarily unavailable)");
  }
});

// === /add <link> ===
bot.command("add", async (ctx) => {
  try {
    const parts = ctx.message.text.split(" ");
    const link = parts[1];

    if (!link) {
      return ctx.reply("⚠️ Please provide a link. Usage: /add <link>");
    }

    const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
    if (rows.length > 0) {
      return ctx.reply("❌ This link already exists in Linktory.");
    }

    const hiddenId = generateHiddenId();
    const publicId = generatePublicId();

    await pool.query(
      "INSERT INTO links (url, submitted_by, status, hidden_id, public_id) VALUES ($1, $2, 'pending', $3, $4)",
      [link, ctx.from.id, hiddenId, publicId]
    );

    await pool.query(
      "UPDATE users SET points = points + 10 WHERE telegram_id=$1",
      [ctx.from.id]
    );

    ctx.reply(`✅ Link added successfully!\nYour link ID: ${hiddenId}\n+10 points earned!`);
  } catch (err) {
    console.error("DB error on /add:", err.message);
    ctx.reply("⚠️ Could not add link (DB error). Try again later.");
  }
});

// === /report <hidden_id> <reason> ===
bot.command("report", async (ctx) => {
  try {
    const parts = ctx.message.text.split(" ");
    const hiddenId = parts[1];
    const reason = parts.slice(2).join(" ") || "No reason";

    if (!hiddenId) return ctx.reply("⚠️ Usage: /report <link_id> <reason>");

    const { rows } = await pool.query("SELECT id FROM links WHERE hidden_id=$1", [hiddenId]);
    if (rows.length === 0) return ctx.reply("❌ Link not found.");

    const linkId = rows[0].id;

    await pool.query(
      "INSERT INTO reports (link_id, reported_by, reason) VALUES ($1, $2, $3)",
      [linkId, ctx.from.id, reason]
    );

    ctx.reply(`⚠️ Report submitted for link.`);
  } catch (err) {
    console.error("DB error on /report:", err.message);
    ctx.reply("⚠️ Could not submit report (DB error). Try again later.");
  }
});

// === /check <link> ===
bot.command("check", async (ctx) => {
  try {
    const parts = ctx.message.text.split(" ");
    const link = parts[1];

    if (!link) return ctx.reply("⚠️ Usage: /check <link>");

    const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);

    if (rows.length === 0) {
      return ctx.reply("❌ No record found. Add it with /add <link>");
    }

    ctx.reply(`ℹ️ Link found:\nID: ${rows[0].hidden_id}\nStatus: ${rows[0].status}`);
  } catch (err) {
    console.error("DB error on /check:", err.message);
    ctx.reply("⚠️ Could not check link (DB error). Try again later.");
  }
});

// === /leaderboard ===
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

// === /referral ===
bot.command("referral", async (ctx) => {
  try {
    const { rows } = await pool.query(
      "SELECT referral_code FROM users WHERE telegram_id=$1",
      [ctx.from.id]
    );

    if (rows.length === 0) return ctx.reply("❌ User not found.");

    ctx.reply(`💡 Your referral code: ${rows[0].referral_code}\nShare it to earn bonus points!`);
  } catch (err) {
    console.error("DB error on /referral:", err.message);
    ctx.reply("⚠️ Could not fetch referral code. Try again later.");
  }
});

// === /help ===
bot.command("help", (ctx) => {
  const helpMsg =
    "📜 Linktory Commands:\n\n" +
    "/start [referral_code] - Start the bot or use a referral code\n" +
    "/add <link> - Add a link to the system\n" +
    "/check <link> - Check if a link exists\n" +
    "/report <link_id> <reason> - Report a link\n" +
    "/leaderboard - View top users\n" +
    "/referral - View your referral code\n" +
    "/help - Show this command list";

  ctx.reply(helpMsg);
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
