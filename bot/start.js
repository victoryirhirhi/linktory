import { Markup } from "telegraf";

export function setupStart(bot, pool) {
  const webAppUrl = `${process.env.RENDER_EXTERNAL_URL || "https://example.com"}/webapp`;

  const mainMenu = Markup.inlineKeyboard([
    [
      Markup.button.callback("➕ Add Link", "ACTION_ADD"),
      Markup.button.callback("🔍 Check Link", "ACTION_CHECK")
    ],
    [
      Markup.button.callback("⚠️ Report Link", "ACTION_REPORT"),
      Markup.button.callback("🏆 Leaderboard", "ACTION_LEADERBOARD")
    ],
    [
      {
        text: "🚀 Open Linktory App",
        web_app: { url: webAppUrl }
      }
    ],
    [ Markup.button.callback("👤 My Dashboard", "ACTION_DASHBOARD") ]
  ]);

  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || null;

    try {
      await pool.query(
        `INSERT INTO users (telegram_id, username, points, trust_score)
         VALUES ($1, $2, 0, 100)
         ON CONFLICT (telegram_id) DO NOTHING`,
        [userId, username]
      );
    } catch (e) {
      console.error("db insert user error:", e);
    }

    await ctx.replyWithMarkdown(
      "🚀 *Welcome to Linktory!*\n\nTrack ✅ Verify ✅ Report ✅\n\nTap a feature below 👇",
      { reply_markup: mainMenu.reply_markup }
    );
  });

  bot.command("menu", async (ctx) => {
    await ctx.reply("🏠 Main Menu", { reply_markup: mainMenu.reply_markup });
  });

  bot.action("ACTION_DASHBOARD", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("👤 Opening your dashboard...");
  });
}
