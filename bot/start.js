// bot/start.js
import { Markup } from "telegraf";
import { replaceReply } from "../utils/helpers.js";

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
  ]);

  // Start
  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || "unknown";

    await pool.query(
      "INSERT INTO users (telegram_id, username, points, trust_score) VALUES ($1, $2, 0, 100) ON CONFLICT (telegram_id) DO NOTHING",
      [userId, username]
    );

    await replaceReply(
      ctx,
      "🚀 *Welcome to Linktory!*\n\nTrack, verify, and report links easily.\n\nChoose an option below 👇",
      { parse_mode: "Markdown", ...mainMenu }
    );
  });

  // /menu (bring back main menu)
  bot.command("menu", async (ctx) => {
    await replaceReply(ctx, "🏠 *Main Menu — Choose an action below:*", {
      parse_mode: "Markdown",
      ...mainMenu,
    });
  });
}
