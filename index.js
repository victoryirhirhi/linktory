// Force Node.js to prefer IPv4
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

// === Helpers ===
function generateHiddenId() {
  return crypto.randomBytes(4).toString("hex"); // 8-char hex
}

// Track last message to delete
const userLastMessage = new Map();

// Delete previous bot message
async function clearPreviousMessage(ctx) {
  const lastMsgId = userLastMessage.get(ctx.from.id);
  if (lastMsgId) {
    try {
      await ctx.deleteMessage(lastMsgId);
    } catch (err) {
      // ignore if cannot delete
    }
  }
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

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("➕ Add Link", "DASH_ADD")],
      [Markup.button.callback("🔍 Check Link", "DASH_CHECK")],
      [Markup.button.callback("⚠️ Report Link", "DASH_REPORT")],
      [Markup.button.callback("📊 Dashboard", "DASHBOARD")],
      [Markup.button.callback("📜 Help", "HELP")]
    ]);

    const sentMsg = await ctx.reply(
      "🚀 Welcome to Linktory! Use the buttons below to interact with the bot.",
      keyboard
    );
    userLastMessage.set(ctx.from.id, sentMsg.message_id);
  } catch (err) {
    console.error("DB error on /start:", err.message);
    ctx.reply("⚠️ Welcome to Linktory! (Database temporarily unavailable)");
  }
});

// === Dashboard ===
async function showDashboard(ctx) {
  await clearPreviousMessage(ctx);
  try {
    const { rows } = await pool.query(
      "SELECT points, referral_code, (SELECT COUNT(*) FROM users WHERE referrer_id=$1) as invited FROM users WHERE telegram_id=$1",
      [ctx.from.id]
    );
    if (rows.length === 0) return ctx.reply("❌ User not found.");
    const user = rows[0];
    const sentMsg = await ctx.reply(
      `📊 Dashboard\n\nPoints: ${user.points}\nReferral Code: ${user.referral_code}\nFriends Invited: ${user.invited}`
    );
    userLastMessage.set(ctx.from.id, sentMsg.message_id);
  } catch (err) {
    console.error("DB error on dashboard:", err.message);
    ctx.reply("⚠️ Could not fetch dashboard. Try again later.");
  }
}

// === Confirmation callbacks ===
bot.action(/DASH_(ADD|CHECK|REPORT|DASHBOARD|HELP)/, async (ctx) => {
  await ctx.answerCbQuery();
  await clearPreviousMessage(ctx);

  const action = ctx.match[1];

  if (action === "DASHBOARD") return showDashboard(ctx);
  if (action === "HELP") {
    const sentMsg = await ctx.reply(
      "📜 Commands:\n" +
        "➕ Add Link\n" +
        "🔍 Check Link\n" +
        "⚠️ Report Link\n" +
        "📊 Dashboard\n" +
        "📜 Help"
    );
    userLastMessage.set(ctx.from.id, sentMsg.message_id);
    return;
  }

  // Ask user to send link or reason
  let msg = "";
  if (action === "ADD") msg = "Please send the link you want to add.";
  if (action === "CHECK") msg = "Please send the link you want to check.";
  if (action === "REPORT") msg =
    "Please send the link and reason separated by | (e.g. https://example.com|spam)";

  const promptMsg = await ctx.reply(msg);
  userLastMessage.set(ctx.from.id, promptMsg.message_id);

  bot.once("text", async (ctx2) => {
    await clearPreviousMessage(ctx2);
    try {
      const text = ctx2.message.text.trim();
      if (action === "ADD") {
        const link = text;
        const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
        if (rows.length > 0) return ctx2.reply("❌ This link already exists in Linktory.");
        const hiddenId = generateHiddenId();
        await pool.query(
          "INSERT INTO links (url, submitted_by, status, hidden_id, public_id) VALUES ($1, $2, 'pending', $3, $4)",
          [link, ctx2.from.id, hiddenId, crypto.randomUUID()]
        );
        await pool.query("UPDATE users SET points = points + 10 WHERE telegram_id=$1", [ctx2.from.id]);
        const sentMsg = await ctx2.reply(
          `✅ Link added successfully!\nYour link ID: ${hiddenId}\n+10 points earned!`
        );
        userLastMessage.set(ctx2.from.id, sentMsg.message_id);
      }

      if (action === "CHECK") {
        const link = text;
        const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
        if (rows.length === 0) return ctx2.reply("❌ No record found. Add it with Add Link.");
        const sentMsg = await ctx2.reply(
          `ℹ️ Link found:\nID: ${rows[0].hidden_id}\nStatus: ${rows[0].status}`
        );
        userLastMessage.set(ctx2.from.id, sentMsg.message_id);
      }

      if (action === "REPORT") {
        const [link, reason] = text.split("|");
        let { rows } = await pool.query("SELECT id FROM links WHERE url=$1", [link]);
        let linkId;
        if (rows.length === 0) {
          const hiddenId = generateHiddenId();
          const res = await pool.query(
            "INSERT INTO links (url, submitted_by, status, hidden_id, public_id) VALUES ($1, $2, 'pending', $3, $4) RETURNING id",
            [link, ctx2.from.id, hiddenId, crypto.randomUUID()]
          );
          linkId = res.rows[0].id;
        } else linkId = rows[0].id;

        await pool.query(
          "INSERT INTO reports (link_id, reported_by, reason) VALUES ($1, $2, $3)",
          [linkId, ctx2.from.id, reason || "No reason"]
        );
        const sentMsg = await ctx2.reply(`⚠️ Report submitted for link.`);
        userLastMessage.set(ctx2.from.id, sentMsg.message_id);
      }
    } catch (err) {
      console.error("DB error on callback text:", err.message);
      ctx2.reply("⚠️ Could not process your request. Try again later.");
    }
  });
});

// === Express Setup ===
const app = express();
app.use(bot.webhookCallback("/webhook"));
app.get("/", (req, res) => res.send("✅ Linktory bot is running!"));
app.get("/health", async (req, res) => {
  try {
    const dbCheck = await pool.query("SELECT NOW()");
    res.json({ status: "ok", db_time: dbCheck.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// === Start Server ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  const url = process.env.RENDER_EXTERNAL_URL;
  if (url) {
    await bot.telegram.setWebhook(`${url}/webhook`);
    console.log(`✅ Webhook set to ${url}/webhook`);
  }
});
