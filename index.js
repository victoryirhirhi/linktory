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
});

// === Init Bot ===
const bot = new Telegraf(process.env.BOT_TOKEN);

// === Helpers ===
function generateHiddenId() {
  return crypto.randomBytes(4).toString("hex");
}

function dashboardKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("➕ Add Link", "DASH_ADD"),
      Markup.button.callback("🔍 Check Link", "DASH_CHECK"),
    ],
    [
      Markup.button.callback("🚨 Report Link", "DASH_REPORT"),
      Markup.button.callback("📊 Dashboard", "DASH_STATS"),
    ],
  ]);
}

// === Trackers ===
const userPendingAction = new Map();
const lastBotMessage = new Map();

// === Message Cleanup Helper ===
async function cleanAndReply(ctx, text, keyboard) {
  const userId = ctx.from.id;
  try {
    // delete user's own input
    if (ctx.message?.message_id) {
      await ctx.deleteMessage(ctx.message.message_id).catch(() => {});
    }

    // delete previous bot message
    const lastMsgId = lastBotMessage.get(userId);
    if (lastMsgId) {
      await ctx.deleteMessage(lastMsgId).catch(() => {});
    }

    // send new message
    const msg = await ctx.reply(text, keyboard);
    lastBotMessage.set(userId, msg.message_id);
  } catch (err) {
    console.error("Cleanup error:", err.message);
    await ctx.reply(text, keyboard);
  }
}

// === START ===
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
      await cleanAndReply(ctx, "🎉 You were referred! Referrer earned 20 points!", dashboardKeyboard());
    }

    await cleanAndReply(
      ctx,
      "🚀 Welcome to Linktory! Use the buttons below to interact with the bot.",
      dashboardKeyboard()
    );
  } catch (err) {
    console.error("DB error on /start:", err.message);
    await cleanAndReply(
      ctx,
      "⚠️ Welcome to Linktory! (Database temporarily unavailable)",
      dashboardKeyboard()
    );
  }
});

// === DASHBOARD ===
bot.action("DASH_STATS", async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;

  try {
    const { rows } = await pool.query(
      "SELECT points, referral_code FROM users WHERE telegram_id=$1",
      [userId]
    );
    if (rows.length === 0)
      return cleanAndReply(ctx, "⚠️ User not found.", dashboardKeyboard());

    const { points, referral_code } = rows[0];
    const { rows: linkRows } = await pool.query(
      "SELECT COUNT(*) FROM links WHERE submitted_by=$1",
      [userId]
    );
    const links = linkRows[0].count;
    const { rows: referralRows } = await pool.query(
      "SELECT COUNT(*) FROM users WHERE referrer_id=$1",
      [userId]
    );
    const invited = referralRows[0].count;
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${referral_code}`;

    await cleanAndReply(
      ctx,
      `📊 Dashboard\n\n⭐ Points: ${points}\n🔗 Links Submitted: ${links}\n👥 Friends Invited: ${invited}\n\n💌 Referral Link:\n${referralLink}`,
      dashboardKeyboard()
    );
  } catch (err) {
    console.error("DB error on dashboard:", err.message);
    await cleanAndReply(ctx, "⚠️ Could not fetch dashboard.", dashboardKeyboard());
  }
});

// === BUTTON HANDLERS ===
bot.action("DASH_ADD", async (ctx) => {
  await ctx.answerCbQuery();
  userPendingAction.set(ctx.from.id, { action: "ADD_LINK" });
  await cleanAndReply(ctx, "➕ Send the link you want to add:", dashboardKeyboard());
});

bot.action("DASH_CHECK", async (ctx) => {
  await ctx.answerCbQuery();
  userPendingAction.set(ctx.from.id, { action: "CHECK_LINK" });
  await cleanAndReply(ctx, "🔍 Send the link you want to check:", dashboardKeyboard());
});

bot.action("DASH_REPORT", async (ctx) => {
  await ctx.answerCbQuery();
  userPendingAction.set(ctx.from.id, { action: "REPORT_LINK", step: 1, temp: {} });
  await cleanAndReply(ctx, "🚨 Send the link you want to report:", dashboardKeyboard());
});

// === TEXT HANDLER ===
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();
  const state = userPendingAction.get(userId);

  try {
    // --- ADD LINK ---
    if (state?.action === "ADD_LINK") {
      if (!/^https?:\/\//.test(text))
        return cleanAndReply(ctx, "⚠️ Invalid link.", dashboardKeyboard());

      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [text]);
      if (rows.length > 0) {
        userPendingAction.delete(userId);
        return cleanAndReply(ctx, "❌ This link already exists.", dashboardKeyboard());
      }

      const hiddenId = generateHiddenId();
      await pool.query(
        "INSERT INTO links (url, submitted_by, status, hidden_id) VALUES ($1,$2,'pending',$3)",
        [text, userId, hiddenId]
      );
      await pool.query("UPDATE users SET points=points+10 WHERE telegram_id=$1", [userId]);

      userPendingAction.delete(userId);
      return cleanAndReply(
        ctx,
        `✅ Link added!\nID: ${hiddenId}\n+10 points earned.`,
        dashboardKeyboard()
      );
    }

    // --- CHECK LINK ---
    if (state?.action === "CHECK_LINK") {
      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [text]);
      userPendingAction.delete(userId);

      if (rows.length === 0)
        return cleanAndReply(ctx, "❌ No record found.", dashboardKeyboard());
      return cleanAndReply(
        ctx,
        `ℹ️ Found link:\nID: ${rows[0].hidden_id}\nStatus: ${rows[0].status}`,
        dashboardKeyboard()
      );
    }

    // --- REPORT LINK ---
    if (state?.action === "REPORT_LINK") {
      if (state.step === 1) {
        let linkId;
        const { rows } = await pool.query("SELECT id FROM links WHERE url=$1", [text]);
        if (rows.length === 0) {
          const hiddenId = generateHiddenId();
          const insert = await pool.query(
            "INSERT INTO links (url, submitted_by, status, hidden_id) VALUES ($1,$2,'pending',$3) RETURNING id",
            [text, userId, hiddenId]
          );
          linkId = insert.rows[0].id;
        } else linkId = rows[0].id;

        state.temp.linkId = linkId;
        state.step = 2;
        userPendingAction.set(userId, state);
        return cleanAndReply(ctx, "📝 Send the reason for reporting this link:", dashboardKeyboard());
      } else if (state.step === 2) {
        await pool.query(
          "INSERT INTO reports (link_id, reported_by, reason) VALUES ($1,$2,$3)",
          [state.temp.linkId, userId, text || "No reason"]
        );
        await pool.query("UPDATE users SET points=points+2 WHERE telegram_id=$1", [userId]);
        userPendingAction.delete(userId);
        return cleanAndReply(ctx, "✅ Report submitted.", dashboardKeyboard());
      }
    }

    // === Detect pasted link without pressing button ===
    if (!state && /^https?:\/\//.test(text)) {
      userPendingAction.set(userId, { action: "LINK_MENU", temp: { link: text } });
      return cleanAndReply(
        ctx,
        "🔗 Detected a link! What do you want to do?",
        Markup.inlineKeyboard([
          [
            Markup.button.callback("➕ Add", "LINK_ADD"),
            Markup.button.callback("🔍 Check", "LINK_CHECK"),
          ],
          [Markup.button.callback("🚨 Report", "LINK_REPORT")],
        ])
      );
    }
  } catch (err) {
    console.error("DB error:", err.message);
    userPendingAction.delete(userId);
    await cleanAndReply(ctx, "⚠️ Database error. Try again later.", dashboardKeyboard());
  }
});

// === /help ===
bot.command("help", (ctx) =>
  cleanAndReply(
    ctx,
    "📜 Commands:\n\n/start [ref_code] - Start or use referral\n/help - Show commands\n\nOr just use the buttons below.",
    dashboardKeyboard()
  )
);

// === Express / Webhook Setup ===
const app = express();
app.use(bot.webhookCallback("/webhook"));
app.get("/", (req, res) => res.send("✅ Linktory bot running"));
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
  console.log(`🚀 Server running on ${PORT}`);
  if (process.env.RENDER_EXTERNAL_URL) {
    await bot.telegram.setWebhook(`${process.env.RENDER_EXTERNAL_URL}/webhook`);
    console.log(`✅ Webhook set to ${process.env.RENDER_EXTERNAL_URL}/webhook`);
  }
});
