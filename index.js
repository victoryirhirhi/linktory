import express from "express";
import { Telegraf, Markup, session } from "telegraf";
import { pool } from "./config/db.js";
import { setupBot } from "./bot/index.js";

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ Keep Render service alive
app.get("/", (req, res) => res.send("🚀 Linktory Bot is alive!"));
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// ✅ Check environment
if (!process.env.BOT_TOKEN || !process.env.DATABASE_URL) {
  console.error("❌ Missing BOT_TOKEN or DATABASE_URL");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

// ✅ Import modular commands
setupBot(bot, pool);

// ✅ Inline Main Menu
const showMainMenu = async (ctx) => {
  try {
    if (ctx.session?.lastMenuMessageId) {
      await ctx.deleteMessage(ctx.session.lastMenuMessageId).catch(() => {});
    }

    const message = await ctx.reply(
      "👋 *Welcome to Linktory Bot!*\nChoose what you want to do:",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("➕ Add Link", "CMD_ADD")],
          [Markup.button.callback("🔍 Check Link", "CMD_CHECK")],
          [Markup.button.callback("🏆 Leaderboard", "CMD_LEADERBOARD")],
          [Markup.button.callback("🚨 Report Link", "CMD_REPORT")],
        ]),
      }
    );

    ctx.session.lastMenuMessageId = message.message_id;
  } catch (err) {
    console.error("Error showing main menu:", err);
  }
};

// ✅ Inline Button Handlers
bot.action("CMD_ADD", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply("📝 Use /add followed by a link to submit a new one.");
});

bot.action("CMD_CHECK", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply("🔍 Use /check followed by a link to verify it.");
});

bot.action("CMD_LEADERBOARD", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply("🏆 Use /leaderboard to see top contributors.");
});

bot.action("CMD_REPORT", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply("🚨 Use /report followed by a link to report a scam or issue.");
});

// ✅ /start Command
bot.start(async (ctx) => {
  await showMainMenu(ctx);
});

bot.launch();
console.log("✅ Linktory Bot running successfully...");

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
