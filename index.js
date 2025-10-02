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

// === Track user pending actions ===
const userPendingAction = new Map(); 

// === Dashboard Keyboard ===
function dashboardKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("➕ Add Link", "DASH_ADD"), Markup.button.callback("🔍 Check Link", "DASH_CHECK")],
    [Markup.button.callback("🚨 Report Link", "DASH_REPORT"), Markup.button.callback("📊 Dashboard", "DASH_STATS")]
  ]);
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
      await ctx.reply("🎉 You were referred! Referrer earned 20 points!");
    }

    await ctx.reply(
      "🚀 Welcome to Linktory! Use the buttons below to interact with the bot.",
      dashboardKeyboard()
    );

  } catch (err) {
    console.error("DB error on /start:", err.message);
    ctx.reply("⚠️ Welcome to Linktory! (Database temporarily unavailable)", dashboardKeyboard());
  }
});

// === Dashboard Button Handlers ===
bot.action(/DASH_.*/, async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const action = ctx.callbackQuery.data;

  if (action === "DASH_ADD") {
    userPendingAction.set(userId, { action: "ADD_LINK", step: 1, temp: {} });
    await ctx.reply("➕ Send the link you want to add:", dashboardKeyboard());
  } else if (action === "DASH_CHECK") {
    userPendingAction.set(userId, { action: "CHECK_LINK", step: 1, temp: {} });
    await ctx.reply("🔍 Send the link you want to check:", dashboardKeyboard());
  } else if (action === "DASH_REPORT") {
    userPendingAction.set(userId, { action: "REPORT_LINK", step: 1, temp: {} });
    await ctx.reply("🚨 Send the link you want to report:", dashboardKeyboard());
  } else if (action === "DASH_STATS") {
    try {
      const { rows } = await pool.query(
        "SELECT points FROM users WHERE telegram_id=$1",
        [userId]
      );
      const points = rows.length > 0 ? rows[0].points : 0;

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

      await ctx.reply(`📊 Your Dashboard:\n\nPoints: ${points}\nLinks submitted: ${links}\nFriends invited: ${invited}`, dashboardKeyboard());
    } catch (err) {
      console.error("DB error on DASH_STATS:", err.message);
      await ctx.reply("⚠️ Could not fetch dashboard. Try again later.", dashboardKeyboard());
    }
  }
});

// === Handle user text messages for pending actions or direct link detection ===
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();

  // Check if text is a URL
  const isLink = /^https?:\/\/\S+/.test(text);

  if (!userPendingAction.has(userId) && isLink) {
    // Ask user what to do with link
    userPendingAction.set(userId, { action: "LINK_MENU", step: 1, temp: { link: text } });
    await ctx.reply("🔗 Detected a link! What do you want to do?", Markup.inlineKeyboard([
      [Markup.button.callback("➕ Add", "LINK_ADD"), Markup.button.callback("🔍 Check", "LINK_CHECK")],
      [Markup.button.callback("🚨 Report", "LINK_REPORT")]
    ]));
    return;
  }

  if (!userPendingAction.has(userId)) return;

  const userState = userPendingAction.get(userId);

  try {
    if (userState.action === "ADD_LINK") {
      const link = text;
      if (!link) return ctx.reply("⚠️ Please send a valid link.", dashboardKeyboard());

      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
      if (rows.length > 0) {
        userPendingAction.delete(userId);
        return ctx.reply("❌ This link already exists.", dashboardKeyboard());
      }

      const hiddenId = generateHiddenId();
      await pool.query(
        "INSERT INTO links (url, submitted_by, status, hidden_id) VALUES ($1, $2, 'pending', $3)",
        [link, userId, hiddenId]
      );
      await pool.query(
        "UPDATE users SET points = points + 10 WHERE telegram_id=$1",
        [userId]
      );
      userPendingAction.delete(userId);
      await ctx.reply(`✅ Link added!\nLink ID: ${hiddenId}\n+10 points earned!`, dashboardKeyboard());

    } else if (userState.action === "CHECK_LINK") {
      const link = text;
      if (!link) return ctx.reply("⚠️ Send a valid link.", dashboardKeyboard());
      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
      userPendingAction.delete(userId);

      if (rows.length === 0) return ctx.reply("❌ No record found.", dashboardKeyboard());
      await ctx.reply(`ℹ️ Link found:\nID: ${rows[0].hidden_id}\nStatus: ${rows[0].status}`, dashboardKeyboard());

    } else if (userState.action === "REPORT_LINK") {
      if (userState.step === 1) {
        // Step 1: receive link
        let linkId;
        const { rows } = await pool.query("SELECT id FROM links WHERE url=$1", [text]);
        if (rows.length === 0) {
          const hiddenId = generateHiddenId();
          const insert = await pool.query(
            "INSERT INTO links (url, submitted_by, status, hidden_id) VALUES ($1, $2, 'pending', $3) RETURNING id",
            [text, userId, hiddenId]
          );
          linkId = insert.rows[0].id;
        } else {
          linkId = rows[0].id;
        }
        userState.temp.linkId = linkId;
        userState.step = 2;
        userPendingAction.set(userId, userState);
        await ctx.reply("📝 Now send the reason for reporting this link:", dashboardKeyboard());
      } else if (userState.step === 2) {
        const linkId = userState.temp.linkId;
        const reason = text || "No reason";
        await pool.query(
          "INSERT INTO reports (link_id, reported_by, reason) VALUES ($1, $2, $3)",
          [linkId, userId, reason]
        );
        userPendingAction.delete(userId);
        await ctx.reply("✅ Report submitted successfully.", dashboardKeyboard());
      }
    } else if (userState.action === "LINK_MENU") {
      // waiting for button press
    }
  } catch (err) {
    console.error("DB error:", err.message);
    userPendingAction.delete(userId);
    await ctx.reply("⚠️ Database error. Try again later.", dashboardKeyboard());
  }
});

// === Link menu buttons from detected plain link ===
bot.action(/LINK_.*/, async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  if (!userPendingAction.has(userId)) return;
  const userState = userPendingAction.get(userId);
  const link = userState.temp.link;

  if (ctx.callbackQuery.data === "LINK_ADD") {
    userPendingAction.set(userId, { action: "ADD_LINK", step: 1, temp: {} });
    await ctx.reply(link, dashboardKeyboard());
  } else if (ctx.callbackQuery.data === "LINK_CHECK") {
    userPendingAction.set(userId, { action: "CHECK_LINK", step: 1, temp: {} });
    await ctx.reply(link, dashboardKeyboard());
  } else if (ctx.callbackQuery.data === "LINK_REPORT") {
    userPendingAction.set(userId, { action: "REPORT_LINK", step: 1, temp: {} });
    await ctx.reply(link, dashboardKeyboard());
  }
  userPendingAction.delete(userId);
});

// === /help Command ===
bot.command("help", (ctx) => {
  const helpMsg =
    "📜 Linktory Commands:\n\n" +
    "/start [referral_code] - Start the bot or use a referral code\n" +
    "/help - Show this command list\n" +
    "Or use the buttons below to interact with the bot.";

  ctx.reply(helpMsg, dashboardKeyboard());
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
