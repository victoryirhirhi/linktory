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
  return crypto.randomBytes(4).toString("hex"); // 8-char hex
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

// Track user pending actions & last message for cleanup
const userPendingAction = new Map();
const lastUserMessage = new Map();

async function cleanLastMessage(ctx) {
  try {
    const chatId = ctx.chat.id;
    const lastMsgId = lastUserMessage.get(chatId);
    if (lastMsgId) {
      await ctx.telegram.deleteMessage(chatId, lastMsgId).catch(() => {});
    }
  } catch {}
}

// === START ===
bot.start(async (ctx) => {
  try {
    await cleanLastMessage(ctx);
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
      `INSERT INTO users (telegram_id, username, points, trust_score, referrer_id, referral_code, is_premium)
       VALUES ($1, $2, 0, 100, $3, $4, false)
       ON CONFLICT (telegram_id) DO NOTHING`,
      [userId, username, referrerId, referralCode]
    );

    if (referrerId) {
      await pool.query(
        "UPDATE users SET points = points + 20 WHERE telegram_id=$1",
        [referrerId]
      );
      await ctx.reply("🎉 You were referred! Referrer earned 20 points!");
    }

    const msg = await ctx.reply(
      "🚀 Welcome to Linktory! Use the buttons below to interact with the bot.",
      dashboardKeyboard()
    );
    lastUserMessage.set(ctx.chat.id, msg.message_id);
  } catch (err) {
    console.error("DB error on /start:", err.message);
    const msg = await ctx.reply(
      "⚠️ Welcome to Linktory! (Database temporarily unavailable)",
      dashboardKeyboard()
    );
    lastUserMessage.set(ctx.chat.id, msg.message_id);
  }
});

// === DASHBOARD ===
bot.action("DASH_STATS", async (ctx) => {
  await cleanLastMessage(ctx);
  await ctx.answerCbQuery();
  const userId = ctx.from.id;

  try {
    const { rows } = await pool.query(
      "SELECT points, referral_code, is_premium FROM users WHERE telegram_id=$1",
      [userId]
    );
    if (rows.length === 0)
      return ctx.reply("⚠️ User not found.", dashboardKeyboard());

    const { points, referral_code, is_premium } = rows[0];

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
    const premiumStatus = is_premium ? "✅ Premium" : "❌ Free";

    const msg = await ctx.reply(
      `📊 Dashboard\n\n⭐ Points: ${points}\n🔗 Links Submitted: ${links}\n👥 Friends Invited: ${invited}\n💎 Status: ${premiumStatus}\n\n💌 Referral Link:\n${referralLink}`,
      dashboardKeyboard()
    );
    lastUserMessage.set(ctx.chat.id, msg.message_id);
  } catch (err) {
    console.error("DB error on dashboard:", err.message);
    const msg = await ctx.reply("⚠️ Could not fetch dashboard.", dashboardKeyboard());
    lastUserMessage.set(ctx.chat.id, msg.message_id);
  }
});

// === BUTTON HANDLERS ===
bot.action(["DASH_ADD", "DASH_CHECK", "DASH_REPORT"], async (ctx) => {
  await ctx.answerCbQuery();
  await cleanLastMessage(ctx);
  const userId = ctx.from.id;

  const actionMap = {
    DASH_ADD: "ADD_LINK",
    DASH_CHECK: "CHECK_LINK",
    DASH_REPORT: "REPORT_LINK",
  };
  const promptMap = {
    DASH_ADD: "➕ Send the link you want to add:",
    DASH_CHECK: "🔍 Send the link you want to check:",
    DASH_REPORT: "🚨 Send the link you want to report:",
  };

  userPendingAction.set(userId, { action: actionMap[ctx.match[0]], step: 1, temp: {} });
  const msg = await ctx.reply(promptMap[ctx.match[0]], dashboardKeyboard());
  lastUserMessage.set(ctx.chat.id, msg.message_id);
});

// === TEXT HANDLER ===
bot.on("text", async (ctx) => {
  await cleanLastMessage(ctx);
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();
  const state = userPendingAction.get(userId);

  try {
    const { rows: userRows } = await pool.query(
      "SELECT * FROM users WHERE telegram_id=$1",
      [userId]
    );
    const user = userRows[0];

    // --- ADD LINK ---
    if (state?.action === "ADD_LINK") {
      if (!/^https?:\/\//.test(text))
        return ctx.reply("⚠️ Invalid link.", dashboardKeyboard());

      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [text]);
      if (rows.length > 0) {
        userPendingAction.delete(userId);
        return ctx.reply("❌ This link already exists.", dashboardKeyboard());
      }

      const hiddenId = generateHiddenId();
      const { rows: insert } = await pool.query(
        "INSERT INTO links (url, submitted_by, status, hidden_id) VALUES ($1,$2,'pending',$3) RETURNING id",
        [text, userId, hiddenId]
      );
      const linkId = insert[0].id;

      // Check if it’s reported and user is premium
      const { rows: reportRows } = await pool.query(
        "SELECT reason FROM reports WHERE link_id=$1",
        [linkId]
      );
      if (reportRows.length > 0 && user.is_premium) {
        await ctx.reply(
          `⚠️ This link has been reported!\nReason: ${reportRows[0].reason}\nWould you like to confirm its status?`,
          Markup.inlineKeyboard([
            [
              Markup.button.callback("✅ Confirm Legit", `CONFIRM_LEGIT_${linkId}`),
              Markup.button.callback("🚨 Confirm Scam", `CONFIRM_SCAM_${linkId}`),
            ],
          ])
        );
      }

      await pool.query("UPDATE users SET points=points+10 WHERE telegram_id=$1", [userId]);
      userPendingAction.delete(userId);
      const msg = await ctx.reply(
        `✅ Link added!\nID: ${hiddenId}\n+10 points earned.`,
        dashboardKeyboard()
      );
      lastUserMessage.set(ctx.chat.id, msg.message_id);
      return;
    }

    // --- CHECK LINK ---
    if (state?.action === "CHECK_LINK") {
      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [text]);
      userPendingAction.delete(userId);

      if (rows.length === 0)
        return ctx.reply("❌ No record found.", dashboardKeyboard());

      const linkId = rows[0].id;
      const { rows: reportRows } = await pool.query(
        "SELECT reason FROM reports WHERE link_id=$1",
        [linkId]
      );

      if (reportRows.length > 0 && user.is_premium) {
        await ctx.reply(
          `⚠️ This link is reported!\nReason: ${reportRows[0].reason}\n\nConfirm status below:`,
          Markup.inlineKeyboard([
            [
              Markup.button.callback("✅ Confirm Legit", `CONFIRM_LEGIT_${linkId}`),
              Markup.button.callback("🚨 Confirm Scam", `CONFIRM_SCAM_${linkId}`),
            ],
          ])
        );
      }

      const msg = await ctx.reply(
        `ℹ️ Found link:\nID: ${rows[0].hidden_id}\nStatus: ${rows[0].status}`,
        dashboardKeyboard()
      );
      lastUserMessage.set(ctx.chat.id, msg.message_id);
      return;
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
        } else {
          linkId = rows[0].id;
        }
        state.temp.linkId = linkId;
        state.step = 2;
        userPendingAction.set(userId, state);
        const msg = await ctx.reply("📝 Send the reason for reporting this link:", dashboardKeyboard());
        lastUserMessage.set(ctx.chat.id, msg.message_id);
        return;
      } else if (state.step === 2) {
        await pool.query(
          "INSERT INTO reports (link_id, reported_by, reason) VALUES ($1,$2,$3)",
          [state.temp.linkId, userId, text || "No reason"]
        );
        await pool.query("UPDATE users SET points=points+2 WHERE telegram_id=$1", [userId]);
        userPendingAction.delete(userId);
        const msg = await ctx.reply("✅ Report submitted.", dashboardKeyboard());
        lastUserMessage.set(ctx.chat.id, msg.message_id);
        return;
      }
    }

    // Detect pasted link directly
    if (!state && /^https?:\/\//.test(text)) {
      userPendingAction.set(userId, { action: "LINK_MENU", temp: { link: text } });
      const msg = await ctx.reply(
        "🔗 Detected a link! What do you want to do?",
        Markup.inlineKeyboard([
          [
            Markup.button.callback("➕ Add", "LINK_ADD"),
            Markup.button.callback("🔍 Check", "LINK_CHECK"),
          ],
          [Markup.button.callback("🚨 Report", "LINK_REPORT")],
        ])
      );
      lastUserMessage.set(ctx.chat.id, msg.message_id);
    }
  } catch (err) {
    console.error("DB error:", err.message);
    userPendingAction.delete(userId);
    const msg = await ctx.reply("⚠️ Database error. Try again later.", dashboardKeyboard());
    lastUserMessage.set(ctx.chat.id, msg.message_id);
  }
});

// === CONFIRMATIONS ===
bot.action(/CONFIRM_(LEGIT|SCAM)_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const [, type, linkId] = ctx.match;
  const userId = ctx.from.id;
  const confirmation = type === "LEGIT" ? "legit" : "scam";

  await pool.query(
    "INSERT INTO confirmations (user_id, link_id, confirmation) VALUES ($1,$2,$3)",
    [userId, linkId, confirmation]
  );

  await pool.query("UPDATE users SET points=points+5 WHERE telegram_id=$1", [userId]);

  await ctx.reply(`✅ Confirmation saved! +5 points awarded.`, dashboardKeyboard());
});

// === Express Setup ===
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on ${PORT}`);
  if (process.env.RENDER_EXTERNAL_URL) {
    await bot.telegram.setWebhook(`${process.env.RENDER_EXTERNAL_URL}/webhook`);
    console.log(`✅ Webhook set to ${process.env.RENDER_EXTERNAL_URL}/webhook`);
  }
});
