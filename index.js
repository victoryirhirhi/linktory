import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import { Telegraf, session, Markup } from "telegraf";
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
bot.use(session());

// === Helper: Generate hidden link ID ===
function generateHiddenId() {
  return crypto.randomBytes(4).toString("hex"); // 8-char hex
}

// === Helper: Clear last bot message per user ===
const userLastMessage = new Map();
async function clearPreviousMessage(ctx) {
  const msgId = userLastMessage.get(ctx.from.id);
  if (msgId) {
    try {
      await ctx.deleteMessage(msgId);
    } catch (e) {}
    userLastMessage.delete(ctx.from.id);
  }
}

// === Dashboard buttons ===
function dashboardKeyboard() {
  return Markup.inlineKeyboard(
    [
      [Markup.button.callback("➕ Add Link", "DASH_ADD"), Markup.button.callback("🔍 Check Link", "DASH_CHECK")],
      [Markup.button.callback("⚠️ Report Link", "DASH_REPORT"), Markup.button.callback("🏆 Leaderboard", "DASH_LEADERBOARD")],
      [Markup.button.callback("💡 Referral", "DASH_REFERRAL")]
    ],
    { columns: 2 }
  );
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
      await pool.query("UPDATE users SET points = points + 20 WHERE telegram_id=$1", [referrerId]);
      ctx.reply("🎉 You were referred! Referrer earned 20 points!");
    }

    const msg = await ctx.reply(
      "🚀 Welcome to Linktory! Use the buttons below to interact with the bot.",
      dashboardKeyboard()
    );
    userLastMessage.set(ctx.from.id, msg.message_id);
  } catch (err) {
    console.error("DB error on /start:", err.message);
    ctx.reply("⚠️ Welcome to Linktory! (Database temporarily unavailable)");
  }
});

// === Handle Dashboard Button Actions ===
bot.action(/DASH_(ADD|CHECK|REPORT|LEADERBOARD|REFERRAL)/, async (ctx) => {
  await ctx.answerCbQuery();
  await clearPreviousMessage(ctx);

  const action = ctx.match[1];
  ctx.session.pendingAction = action;

  let msg = "";
  if (action === "ADD") msg = "Please send the link you want to add.";
  else if (action === "CHECK") msg = "Please send the link you want to check.";
  else if (action === "REPORT") msg = "Send the link and reason separated by | (e.g. https://example.com|spam)";
  else if (action === "LEADERBOARD") {
    try {
      const { rows } = await pool.query("SELECT username, points FROM users ORDER BY points DESC LIMIT 10");
      let message = "🏆 Top Contributors:\n\n";
      rows.forEach((u, i) => {
        message += `${i + 1}. ${u.username} — ${u.points} pts\n`;
      });
      const sentMsg = await ctx.reply(message, dashboardKeyboard());
      userLastMessage.set(ctx.from.id, sentMsg.message_id);
      ctx.session.pendingAction = null;
      return;
    } catch (err) {
      console.error("DB error on leaderboard:", err.message);
      const sentMsg = await ctx.reply("⚠️ Could not load leaderboard.", dashboardKeyboard());
      userLastMessage.set(ctx.from.id, sentMsg.message_id);
      ctx.session.pendingAction = null;
      return;
    }
  } else if (action === "REFERRAL") {
    try {
      const { rows } = await pool.query("SELECT referral_code, points FROM users WHERE telegram_id=$1", [ctx.from.id]);
      if (rows.length === 0) return ctx.reply("❌ User not found.");
      const referralMsg = `💡 Your referral link: t.me/YourBotUsername?start=${rows[0].referral_code}\nTotal points: ${rows[0].points}`;
      const sentMsg = await ctx.reply(referralMsg, dashboardKeyboard());
      userLastMessage.set(ctx.from.id, sentMsg.message_id);
      ctx.session.pendingAction = null;
      return;
    } catch (err) {
      console.error("DB error on referral:", err.message);
      const sentMsg = await ctx.reply("⚠️ Could not fetch referral info.", dashboardKeyboard());
      userLastMessage.set(ctx.from.id, sentMsg.message_id);
      ctx.session.pendingAction = null;
      return;
    }
  }

  const sentMsg = await ctx.reply(msg);
  userLastMessage.set(ctx.from.id, sentMsg.message_id);
});

// === Handle User Text for Session Actions ===
bot.on("text", async (ctx) => {
  const action = ctx.session.pendingAction;
  if (!action) return;
  await clearPreviousMessage(ctx);

  const text = ctx.message.text.trim();

  try {
    if (action === "ADD") {
      const link = text;
      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
      if (rows.length > 0) return ctx.reply("❌ This link already exists in Linktory.", dashboardKeyboard());
      const hiddenId = generateHiddenId();
      await pool.query(
        "INSERT INTO links (url, submitted_by, status, hidden_id, public_id) VALUES ($1, $2, 'pending', $3, $4)",
        [link, ctx.from.id, hiddenId, crypto.randomUUID()]
      );
      await pool.query("UPDATE users SET points = points + 10 WHERE telegram_id=$1", [ctx.from.id]);
      const sentMsg = await ctx.reply(`✅ Link added! ID: ${hiddenId}\n+10 points earned!`, dashboardKeyboard());
      userLastMessage.set(ctx.from.id, sentMsg.message_id);
    }

    if (action === "CHECK") {
      const link = text;
      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
      if (rows.length === 0) return ctx.reply("❌ No record found. Add it first.", dashboardKeyboard());
      const sentMsg = await ctx.reply(`ℹ️ Link found:\nID: ${rows[0].hidden_id}\nStatus: ${rows[0].status}`, dashboardKeyboard());
      userLastMessage.set(ctx.from.id, sentMsg.message_id);
    }

    if (action === "REPORT") {
      const [link, reason] = text.split("|");
      let { rows } = await pool.query("SELECT id FROM links WHERE url=$1", [link]);
      let linkId;
      if (rows.length === 0) {
        const hiddenId = generateHiddenId();
        const res = await pool.query(
          "INSERT INTO links (url, submitted_by, status, hidden_id, public_id) VALUES ($1, $2, 'pending', $3, $4) RETURNING id",
          [link, ctx.from.id, hiddenId, crypto.randomUUID()]
        );
        linkId = res.rows[0].id;
      } else linkId = rows[0].id;

      await pool.query("INSERT INTO reports (link_id, reported_by, reason) VALUES ($1, $2, $3)", [
        linkId,
        ctx.from.id,
        reason || "No reason"
      ]);

      const sentMsg = await ctx.reply("⚠️ Report submitted.", dashboardKeyboard());
      userLastMessage.set(ctx.from.id, sentMsg.message_id);
    }

    ctx.session.pendingAction = null;
  } catch (err) {
    console.error("DB error on user text:", err.message);
    const sentMsg = await ctx.reply("⚠️ Could not process request. Try again later.", dashboardKeyboard());
    userLastMessage.set(ctx.from.id, sentMsg.message_id);
    ctx.session.pendingAction = null;
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
