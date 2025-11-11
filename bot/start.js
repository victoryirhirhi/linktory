// bot/start.js
import { Markup } from "telegraf";
import jwt from "jsonwebtoken";

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
      Markup.button.webApp("🚀 Open Linktory App", webAppUrl)
    ],
    [Markup.button.callback("👤 My Dashboard", "ACTION_DASHBOARD")]
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

      // Generate JWT token
      const token = jwt.sign(
        { telegram_id: userId, username },
        process.env.JWT_SECRET,
        { expiresIn: "30d" }
      );

      // Send WebApp link with token
      await ctx.replyWithMarkdown(
        `🚀 *Welcome to Linktory!*\n\nTap below to open the Mini App:`,
        {
          reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.webApp("Open Linktory App", `${webAppUrl}?token=${token}`)
            ]
          ]).reply_markup
        }
      );

    } catch (e) {
      console.error("db insert user error:", e);
    }

    // Also show main menu
    await ctx.replyWithMarkdown(
      "Tap a feature below 👇",
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
