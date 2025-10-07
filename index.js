import { Telegraf, Markup } from "telegraf";
import pkg from "pg";
const { Pool } = pkg;

const bot = new Telegraf(process.env.BOT_TOKEN);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// 🧠 Track messages per user to keep chat clean
const userMessages = new Map();

// ✅ Helper: Clear old messages (keep dashboard)
async function clearUserMessages(ctx) {
  const messages = userMessages.get(ctx.from.id) || [];
  for (const msgId of messages) {
    try {
      await ctx.deleteMessage(msgId);
    } catch (err) {
      // Ignore errors for deleted/old messages
    }
  }
  userMessages.set(ctx.from.id, []);
}

// ✅ Helper: Save message ID for cleanup
function trackUserMessage(ctx, message) {
  if (!userMessages.has(ctx.from.id)) userMessages.set(ctx.from.id, []);
  userMessages.get(ctx.from.id).push(message.message_id);
}

// ✅ Dashboard Buttons (2 per row)
function dashboardKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("➕ Add Link", "DASH_ADD"), Markup.button.callback("🔍 Check Link", "DASH_CHECK")],
    [Markup.button.callback("🚨 Report Link", "DASH_REPORT"), Markup.button.callback("📊 My Dashboard", "DASH_REFERRAL")],
  ]);
}

// ✅ Start Command
bot.start(async (ctx) => {
  await clearUserMessages(ctx);
  const sent = await ctx.reply("🚀 Welcome to Linktory! Use the buttons below to interact with the bot.", dashboardKeyboard());
  trackUserMessage(ctx, sent);
});

// ✅ Add Link
bot.action("DASH_ADD", async (ctx) => {
  await ctx.answerCbQuery();
  await clearUserMessages(ctx);
  const sent = await ctx.reply("🔗 Send the link you want to add:");
  trackUserMessage(ctx, sent);

  bot.on("text", async (ctx2) => {
    const link = ctx2.message.text.trim();
    try {
      await pool.query("INSERT INTO links (url, added_by) VALUES ($1, $2)", [link, ctx2.from.id]);
      await clearUserMessages(ctx2);
      const conf = await ctx2.reply("✅ Link added successfully!", dashboardKeyboard());
      trackUserMessage(ctx2, conf);
    } catch (err) {
      console.error("Database error:", err);
      const fail = await ctx2.reply("❌ Database error, please try again later.", dashboardKeyboard());
      trackUserMessage(ctx2, fail);
    }
  });
});

// ✅ Check Link
bot.action("DASH_CHECK", async (ctx) => {
  await ctx.answerCbQuery();
  await clearUserMessages(ctx);
  const sent = await ctx.reply("🔎 Send the link you want to check:");
  trackUserMessage(ctx, sent);

  bot.on("text", async (ctx2) => {
    const link = ctx2.message.text.trim();
    try {
      const res = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
      await clearUserMessages(ctx2);
      if (res.rowCount > 0) {
        const ok = await ctx2.reply("✅ This link is in our database and verified!", dashboardKeyboard());
        trackUserMessage(ctx2, ok);
      } else {
        const bad = await ctx2.reply("⚠️ Link not found. You can report it if suspicious.", dashboardKeyboard());
        trackUserMessage(ctx2, bad);
      }
    } catch (err) {
      console.error("Database error:", err);
      const fail = await ctx2.reply("❌ Database error, please try again later.", dashboardKeyboard());
      trackUserMessage(ctx2, fail);
    }
  });
});

// ✅ Report Link
bot.action("DASH_REPORT", async (ctx) => {
  await ctx.answerCbQuery();
  await clearUserMessages(ctx);
  const sent = await ctx.reply("🚨 Send the link you want to report:");
  trackUserMessage(ctx, sent);

  bot.on("text", async (ctx2) => {
    const link = ctx2.message.text.trim();
    try {
      const linkRes = await pool.query("SELECT id FROM links WHERE url=$1", [link]);
      if (linkRes.rowCount === 0) {
        const noLink = await ctx2.reply("⚠️ This link isn’t in our database yet. Please add it first.", dashboardKeyboard());
        trackUserMessage(ctx2, noLink);
        return;
      }

      await pool.query("INSERT INTO reports (link_id, reported_by, reason) VALUES ($1, $2, $3)", [
        linkRes.rows[0].id,
        ctx2.from.id,
        "User report",
      ]);

      await clearUserMessages(ctx2);
      const done = await ctx2.reply("✅ Thank you! Your report has been submitted.", dashboardKeyboard());
      trackUserMessage(ctx2, done);
    } catch (err) {
      console.error("Database error:", err);
      const fail = await ctx2.reply("❌ Database error, please try again later.", dashboardKeyboard());
      trackUserMessage(ctx2, fail);
    }
  });
});

// ✅ Dashboard (Referral)
bot.action("DASH_REFERRAL", async (ctx) => {
  await ctx.answerCbQuery();
  await clearUserMessages(ctx);
  const sent = await ctx.reply("📊 Your dashboard is under construction.", dashboardKeyboard());
  trackUserMessage(ctx, sent);
});

// ✅ Launch bot
bot.launch();
console.log("🚀 Linktory bot running successfully!");
