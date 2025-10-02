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

// === Helper: Dashboard Keyboard ===
function dashboardKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("➕ Add Link", "DASH_ADD"), Markup.button.callback("🔍 Check Link", "DASH_CHECK")],
    [Markup.button.callback("🚨 Report Link", "DASH_REPORT"), Markup.button.callback("📊 Dashboard", "DASH_REFERRAL")],
    [Markup.button.callback("❓ Help", "DASH_HELP")]
  ]);
}

// === Track user last message to clear UI ===
const userLastMessage = new Map();

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

    const sentMsg = await ctx.reply(
      "🚀 Welcome to Linktory! Use the buttons below to interact with the bot.",
      dashboardKeyboard()
    );
    userLastMessage.set(userId, sentMsg.message_id);

  } catch (err) {
    console.error("DB error on /start:", err.message);
    ctx.reply("⚠️ Welcome to Linktory! (Database temporarily unavailable)");
  }
});

// === Dashboard Button Handlers ===
bot.action(/DASH_.*/, async (ctx) => {
  await ctx.answerCbQuery(); // remove loading state
  const userId = ctx.from.id;

  // Clear previous message
  if (userLastMessage.has(userId)) {
    try { await ctx.deleteMessage(userLastMessage.get(userId)); } catch {}
  }

  const action = ctx.callbackQuery.data;

  if (action === "DASH_ADD") {
    ctx.session = { pendingAction: "ADD_LINK" };
    const sentMsg = await ctx.reply("📎 Please send the link you want to add:");
    userLastMessage.set(userId, sentMsg.message_id);

  } else if (action === "DASH_CHECK") {
    ctx.session = { pendingAction: "CHECK_LINK" };
    const sentMsg = await ctx.reply("🔍 Please send the link you want to check:");
    userLastMessage.set(userId, sentMsg.message_id);

  } else if (action === "DASH_REPORT") {
    ctx.session = { pendingAction: "REPORT_LINK" };
    const sentMsg = await ctx.reply("🚨 Please send the link you want to report:");
    userLastMessage.set(userId, sentMsg.message_id);

  } else if (action === "DASH_REFERRAL") {
    try {
      const { rows } = await pool.query(
        "SELECT referral_code, points FROM users WHERE telegram_id=$1",
        [userId]
      );
      if (rows.length === 0) return ctx.reply("❌ User not found.");

      // Count friends invited
      const { rows: friends } = await pool.query(
        "SELECT COUNT(*) FROM users WHERE referrer_id=$1",
        [userId]
      );

      // Count links submitted
      const { rows: links } = await pool.query(
        "SELECT COUNT(*) FROM links WHERE submitted_by=$1",
        [userId]
      );

      const referralMsg = `💡 Your referral link: t.me/YourBotUsername?start=${rows[0].referral_code}\n` +
                          `Total points: ${rows[0].points}\n` +
                          `Links submitted: ${links[0].count}\n` +
                          `Friends invited: ${friends[0].count}`;

      const sentMsg = await ctx.reply(referralMsg, dashboardKeyboard());
      userLastMessage.set(userId, sentMsg.message_id);

    } catch (err) {
      console.error("DB error on referral:", err.message);
      const sentMsg = await ctx.reply("⚠️ Could not fetch referral info.", dashboardKeyboard());
      userLastMessage.set(userId, sentMsg.message_id);
    }

  } else if (action === "DASH_HELP") {
    const helpMsg =
      "📜 Linktory Commands:\n\n" +
      "/start [referral_code] - Start the bot or use a referral code\n" +
      "/add <link> - Add a link\n" +
      "/check <link> - Check a link\n" +
      "/report <link> - Report a link\n" +
      "/leaderboard - View top users\n" +
      "/referral - View your referral link\n" +
      "/help - Show this command list";

    const sentMsg = await ctx.reply(helpMsg, dashboardKeyboard());
    userLastMessage.set(userId, sentMsg.message_id);
  }

  ctx.session.pendingAction = ctx.session.pendingAction || null;
});

// === Handle user text messages for pending actions ===
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  if (!ctx.session || !ctx.session.pendingAction) return;

  const text = ctx.message.text.trim();
  let sentMsg;

  try {
    if (ctx.session.pendingAction === "ADD_LINK") {
      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [text]);
      if (rows.length > 0) {
        sentMsg = await ctx.reply("❌ This link already exists.", dashboardKeyboard());
      } else {
        const hiddenId = generateHiddenId();
        await pool.query("INSERT INTO links (url, submitted_by, status, hidden_id) VALUES ($1, $2, 'pending', $3)", [text, userId, hiddenId]);
        await pool.query("UPDATE users SET points = points + 10 WHERE telegram_id=$1", [userId]);
        sentMsg = await ctx.reply(`✅ Link added! ID: ${hiddenId}\n+10 points earned!`, dashboardKeyboard());
      }

    } else if (ctx.session.pendingAction === "CHECK_LINK") {
      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [text]);
      if (rows.length === 0) {
        sentMsg = await ctx.reply("❌ No record found. Add it with Add Link.", dashboardKeyboard());
      } else {
        sentMsg = await ctx.reply(`ℹ️ Link found:\nID: ${rows[0].hidden_id}\nStatus: ${rows[0].status}`, dashboardKeyboard());
      }

    } else if (ctx.session.pendingAction === "REPORT_LINK") {
      let linkId;
      const { rows } = await pool.query("SELECT id FROM links WHERE url=$1", [text]);
      if (rows.length === 0) {
        const hiddenId = generateHiddenId();
        const insert = await pool.query("INSERT INTO links (url, submitted_by, status, hidden_id) VALUES ($1, $2, 'pending', $3) RETURNING id", [text, userId, generateHiddenId()]);
        linkId = insert.rows[0].id;
      } else {
        linkId = rows[0].id;
      }
      await pool.query("INSERT INTO reports (link_id, reported_by, reason) VALUES ($1, $2, $3)", [linkId, userId, "Reported via button"]);
      sentMsg = await ctx.reply("🚨 Report submitted successfully.", dashboardKeyboard());
    }
  } catch (err) {
    console.error("DB error:", err.message);
    sentMsg = await ctx.reply("⚠️ Database error. Try again later.", dashboardKeyboard());
  }

  userLastMessage.set(userId, sentMsg.message_id);
  ctx.session.pendingAction = null;
});

// === /leaderboard Command ===
bot.command("leaderboard", async (ctx) => {
  try {
    const { rows } = await pool.query("SELECT username, points FROM users ORDER BY points DESC LIMIT 10");
    let message = "🏆 Top Contributors:\n\n";
    rows.forEach((u, i) => { message += `${i + 1}. ${u.username} — ${u.points} pts\n`; });
    ctx.reply(message);
  } catch (err) {
    console.error("DB error on /leaderboard:", err.message);
    ctx.reply("⚠️ Could not load leaderboard (DB error).");
  }
});

// === Webhook Setup ===
const app = express();
app.use(bot.webhookCallback("/webhook"));

app.get("/", (req, res) => res.send("✅ Linktory bot is running!"));
app.get("/health", async (req, res) => {
  try { const dbCheck = await pool.query("SELECT NOW()"); res.json({ status: "ok", db_time: dbCheck.rows[0].now }); }
  catch (err) { res.status(500).json({ status: "error", message: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  const url = process.env.RENDER_EXTERNAL_URL;
  if (url) { await bot.telegram.setWebhook(`${url}/webhook`); console.log(`✅ Webhook set to ${url}/webhook`); }
});
