import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import { Telegraf, Markup } from "telegraf";
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

// === Helper: Generate hidden link ID ===
function generateHiddenId() {
  return crypto.randomBytes(4).toString("hex"); // 8-char hex
}

// === /start Command ===
bot.start(async (ctx) => {
  try {
    const userId = ctx.from.id;
    const username = ctx.from.username || "unknown";
    const parts = ctx.message.text.split(" ");
    const referrerLink = parts[1];

    let referrerId = null;
    if (referrerLink) {
      const refId = parseInt(referrerLink);
      if (!isNaN(refId)) {
        const { rows } = await pool.query(
          "SELECT telegram_id FROM users WHERE telegram_id=$1",
          [refId]
        );
        if (rows.length > 0) referrerId = rows[0].telegram_id;
      }
    }

    await pool.query(
      `INSERT INTO users (telegram_id, username, points, trust_score, referrer_id)
       VALUES ($1, $2, 0, 100, $3)
       ON CONFLICT (telegram_id) DO NOTHING`,
      [userId, username, referrerId]
    );

    if (referrerId) {
      await pool.query(
        "UPDATE users SET points = points + 20 WHERE telegram_id=$1",
        [referrerId]
      );
      ctx.reply("🎉 You were referred! Referrer earned 20 points!");
    }

    // Show Dashboard button after start
    ctx.reply(
      "🚀 Welcome to Linktory! Use the Dashboard button to manage links and see stats.",
      Markup.keyboard([["Dashboard"]]).resize()
    );
  } catch (err) {
    console.error("DB error on /start:", err.message);
    ctx.reply("⚠️ Welcome to Linktory! (Database temporarily unavailable)");
  }
});

// === /add <link> Command ===
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

    await pool.query(
      "INSERT INTO links (url, submitted_by, status, hidden_id) VALUES ($1, $2, 'pending', $3)",
      [link, ctx.from.id, hiddenId]
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

// === /report Command ===
bot.command("report", async (ctx) => {
  try {
    const parts = ctx.message.text.split(" ");
    const linkInput = parts[1];
    const reason = parts.slice(2).join(" ") || "No reason";

    if (!linkInput) return ctx.reply("⚠️ Usage: /report <link> <reason>");

    // Check if link exists, add if not
    let { rows } = await pool.query("SELECT id, hidden_id FROM links WHERE url=$1", [linkInput]);
    let linkId;
    let hiddenId;
    if (rows.length === 0) {
      hiddenId = generateHiddenId();
      const res = await pool.query(
        "INSERT INTO links (url, submitted_by, status, hidden_id) VALUES ($1, $2, 'pending', $3) RETURNING id, hidden_id",
        [linkInput, ctx.from.id, hiddenId]
      );
      linkId = res.rows[0].id;
    } else {
      linkId = rows[0].id;
      hiddenId = rows[0].hidden_id;
    }

    await pool.query(
      "INSERT INTO reports (link_id, reported_by, reason) VALUES ($1, $2, $3)",
      [linkId, ctx.from.id, reason]
    );

    ctx.reply(`⚠️ Report submitted for link ID: ${hiddenId}`);
  } catch (err) {
    console.error("DB error on /report:", err.message);
    ctx.reply("⚠️ Could not submit report (DB error). Try again later.");
  }
});

// === Dashboard Button ===
bot.hears("Dashboard", async (ctx) => {
  try {
    ctx.reply(
      "📊 Your Dashboard:",
      Markup.inlineKeyboard([
        [Markup.button.callback("💰 Points", "DASHBOARD_POINTS")],
        [Markup.button.callback("🔗 Links Submitted", "DASHBOARD_LINKS")],
        [Markup.button.callback("👥 Friends Invited", "DASHBOARD_FRIENDS")],
        [Markup.button.callback("🔗 Referral Link", "DASHBOARD_REFERRAL")]
      ])
    );
  } catch (err) {
    console.error("DB error on dashboard:", err.message);
    ctx.reply("⚠️ Could not fetch dashboard.");
  }
});

// === Dashboard Callbacks ===
bot.action("DASHBOARD_POINTS", async (ctx) => {
  const userId = ctx.from.id;
  const { rows } = await pool.query("SELECT points FROM users WHERE telegram_id=$1", [userId]);
  await ctx.answerCbQuery();
  ctx.reply(`💰 Your Points: ${rows[0].points}`);
});

bot.action("DASHBOARD_LINKS", async (ctx) => {
  const userId = ctx.from.id;
  const { rows } = await pool.query("SELECT COUNT(*) FROM links WHERE submitted_by=$1", [userId]);
  await ctx.answerCbQuery();
  ctx.reply(`🔗 Links Submitted: ${rows[0].count}`);
});

bot.action("DASHBOARD_FRIENDS", async (ctx) => {
  const userId = ctx.from.id;
  const { rows } = await pool.query("SELECT COUNT(*) FROM users WHERE referrer_id=$1", [userId]);
  await ctx.answerCbQuery();
  ctx.reply(`👥 Friends Invited: ${rows[0].count}`);
});

bot.action("DASHBOARD_REFERRAL", async (ctx) => {
  const userId = ctx.from.id;
  const referralLink = `https://t.me/${bot.options.username}?start=${userId}`;
  await ctx.answerCbQuery();
  ctx.reply(`🔗 Your Referral Link: ${referralLink}`);
});

// === /help Command ===
bot.command("help", (ctx) => {
  const helpMsg =
    "📜 Linktory Commands:\n\n" +
    "/start [referral_link] - Start the bot with referral link\n" +
    "/add <link> - Add a link\n" +
    "/report <link> <reason> - Report a link\n" +
    "Dashboard - Click to view stats and referral link\n" +
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
