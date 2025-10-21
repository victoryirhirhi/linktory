// bot/start.js
import { Markup } from "telegraf";

export default function startCommand(bot, pool) {
  const mainMenu = Markup.inlineKeyboard([
    [
      Markup.button.callback("➕ Add Link", "ACTION_ADD"),
      Markup.button.callback("🔍 Check Link", "ACTION_CHECK"),
    ],
    [
      Markup.button.callback("⚠️ Report Link", "ACTION_REPORT"),
      Markup.button.callback("🏆 Leaderboard", "ACTION_LEADERBOARD"),
    ],
    [Markup.button.callback("👤 My Dashboard", "ACTION_DASHBOARD")],
  ]);

  // Start command
  bot.start(async (ctx) => {
    await ctx.deleteMessage().catch(() => {}); // Clean screen
    const userId = ctx.from.id;
    const username = ctx.from.username || "unknown";

    await pool.query(
      "INSERT INTO users (telegram_id, username, points, trust_score) VALUES ($1, $2, 0, 100) ON CONFLICT (telegram_id) DO NOTHING",
      [userId, username]
    );

    await ctx.replyWithMarkdown(
      "🚀 *Welcome to Linktory!*\n\nTrack, verify, and report links easily.\n\nChoose an option below 👇",
      mainMenu
    );
  });

  // Menu command
  bot.command("menu", async (ctx) => {
    await ctx.deleteMessage().catch(() => {});
    await ctx.replyWithMarkdown("🏠 *Main Menu — Choose an action below:*", mainMenu);
  });

  // Button Handlers
  bot.action("ACTION_ADD", async (ctx) => {
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply("📎 Send me the link you want to *add*.");
  });

  bot.action("ACTION_CHECK", async (ctx) => {
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply("🔍 Send the link you want to *check*.");
  });

  bot.action("ACTION_REPORT", async (ctx) => {
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply("⚠️ Send the link you want to *report*.");
  });

  bot.action("ACTION_LEADERBOARD", async (ctx) => {
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply("🏆 Fetching leaderboard...");
  });

  bot.action("ACTION_DASHBOARD", async (ctx) => {
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply("👤 Opening your dashboard...");
  });
}
