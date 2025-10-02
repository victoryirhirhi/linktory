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

// === Helper: Generate IDs ===
function generateHiddenId() {
  return crypto.randomBytes(4).toString("hex");
}
function generatePublicId() {
  return crypto.randomBytes(3).toString("hex");
}

// === Temporary user state ===
const userState = {}; // { telegramId: { action, linkToReport } }

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

    await ctx.reply(
      "🚀 Welcome to Linktory! Use the buttons below to interact:",
      Markup.keyboard([
        ["Add Link", "Report Link"],
        ["Check Link", "Leaderboard"],
        ["Referral", "Help"]
      ]).resize()
    );
  } catch (err) {
    console.error("DB error on /start:", err.message);
    ctx.reply("⚠️ Welcome to Linktory! (Database temporarily unavailable)");
  }
});

// === Handle button messages ===
bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  try {
    if (text === "Add Link") {
      userState[userId] = { action: "add" };
      return ctx.reply("🔗 Please send the link you want to add:");
    }
    if (text === "Report Link") {
      userState[userId] = { action: "report" };
      return ctx.reply("⚠️ Please send the link you want to report:");
    }
    if (text === "Check Link") {
      userState[userId] = { action: "check" };
      return ctx.reply("ℹ️ Please send the link you want to check:");
    }
    if (text === "Leaderboard") {
      const { rows } = await pool.query(
        "SELECT username, points FROM users ORDER BY points DESC LIMIT 10"
      );
      let msg = "🏆 Top Contributors:\n\n";
      rows.forEach((u, i) => {
        msg += `${i + 1}. ${u.username} — ${u.points} pts\n`;
      });
      return ctx.reply(msg);
    }
    if (text === "Referral") {
      const { rows } = await pool.query(
        "SELECT referral_code FROM users WHERE telegram_id=$1",
        [userId]
      );
      if (rows.length === 0) return ctx.reply("❌ User not found.");
      return ctx.reply(`💡 Your referral code: ${rows[0].referral_code}`);
    }
    if (text === "Help") {
      const helpMsg =
        "📜 Linktory Commands via buttons:\n\n" +
        "Add Link - Submit a new link\n" +
        "Report Link - Report a suspicious link\n" +
        "Check Link - Check if a link exists\n" +
        "Leaderboard - View top users\n" +
        "Referral - View your referral code\n" +
        "Help - Show this menu";
      return ctx.reply(helpMsg);
    }

    // Handle user input based on state
    const state = userState[userId];
    if (!state) return;

    if (state.action === "add") {
      const link = text.trim();
      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
      if (rows.length > 0) {
        userState[userId] = null;
        return ctx.reply("❌ This link already exists.");
      }
      const hiddenId = generateHiddenId();
      const publicId = generatePublicId();
      await pool.query(
        "INSERT INTO links (url, submitted_by, status, hidden_id, public_id) VALUES ($1, $2, 'pending', $3, $4)",
        [link, userId, hiddenId, publicId]
      );
      await pool.query(
        "UPDATE users SET points = points + 10 WHERE telegram_id=$1",
        [userId]
      );
      userState[userId] = null;
      return ctx.reply(`✅ Link added!\nLink ID: ${hiddenId}\n+10 points earned`);
    }

    if (state.action === "report") {
      const link = text.trim();
      let { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
      let linkId;
      if (rows.length === 0) {
        const hiddenId = generateHiddenId();
        const publicId = generatePublicId();
        const res = await pool.query(
          "INSERT INTO links (url, submitted_by, status, hidden_id, public_id) VALUES ($1, $2, 'reported', $3, $4) RETURNING id",
          [link, userId, hiddenId, publicId]
        );
        linkId = res.rows[0].id;
      } else {
        linkId = rows[0].id;
        await pool.query("UPDATE links SET status='reported' WHERE id=$1", [linkId]);
      }
      await pool.query(
        "INSERT INTO reports (link_id, reported_by, reason) VALUES ($1, $2, $3)",
        [linkId, userId, "Reported by user"]
      );
      userState[userId] = null;
      return ctx.reply(`⚠️ Link reported successfully.`);
    }

    if (state.action === "check") {
      const link = text.trim();
      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
      userState[userId] = null;
      if (rows.length === 0) return ctx.reply("❌ No record found. Add it with Add Link button");
      
      // Show inline button for reporting
      return ctx.reply(
        `ℹ️ Link found:\nID: ${rows[0].hidden_id}\nStatus: ${rows[0].status}`,
        Markup.inlineKeyboard([
          Markup.button.callback("Report this Link", `report_${rows[0].hidden_id}`)
        ])
      );
    }

  } catch (err) {
    console.error("DB error:", err.message);
    userState[userId] = null;
    ctx.reply("⚠️ Database error. Try again later.");
  }
});

// === Inline button callback handler ===
bot.on("callback_query", async (ctx) => {
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;

  if (data.startsWith("report_")) {
    const hiddenId = data.split("_")[1];
    try {
      const { rows } = await pool.query("SELECT id, url FROM links WHERE hidden_id=$1", [hiddenId]);
      if (rows.length === 0) return ctx.answerCbQuery("❌ Link not found.");

      const linkId = rows[0].id;
      await pool.query(
        "INSERT INTO reports (link_id, reported_by, reason) VALUES ($1, $2, $3)",
        [linkId, userId, "Reported via button"]
      );
      await pool.query("UPDATE links SET status='reported' WHERE id=$1", [linkId]);

      await ctx.editMessageReplyMarkup();
      return ctx.answerCbQuery("⚠️ Link reported successfully!");
    } catch (err) {
      console.error("DB error on callback:", err.message);
      return ctx.answerCbQuery("⚠️ DB error. Try again later.");
    }
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
