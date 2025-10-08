// bot/dashboard.js
import { Markup } from "telegraf";

export default function dashboardCommand(bot, pool) {
  bot.action("ACTION_DASHBOARD", async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;

    // Fetch user info
    const userRes = await pool.query(
      "SELECT username, points, trust_score FROM users WHERE telegram_id=$1",
      [userId]
    );

    if (userRes.rows.length === 0) {
      return ctx.reply("❌ You are not registered yet. Use /start to begin.");
    }

    const user = userRes.rows[0];

    // Count user's links
    const linkRes = await pool.query(
      "SELECT COUNT(*) FROM links WHERE submitted_by=$1",
      [userId]
    );
    const linksAdded = linkRes.rows[0].count;

    // Count user's reports
    const reportRes = await pool.query(
      "SELECT COUNT(*) FROM reports WHERE reported_by=$1",
      [userId]
    );
    const reportsMade = reportRes.rows[0].count;

    const message = `
👤 *My Dashboard*
━━━━━━━━━━━━━━━
🏷️ Username: @${user.username || "unknown"}
💰 Points: *${user.points}*
🔰 Trust Score: *${user.trust_score}*
📎 Links Added: *${linksAdded}*
⚠️ Reports Made: *${reportsMade}*

Keep contributing to build a safer web 🌍
`;

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback("🏠 Back to Menu", "ACTION_BACK_MENU")],
    ]);

    await ctx.reply(message, { parse_mode: "Markdown", ...buttons });
  });

  // Handle going back to menu
  bot.action("ACTION_BACK_MENU", async (ctx) => {
    await ctx.answerCbQuery();

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

    await ctx.editMessageText("🏠 *Main Menu — Choose an action below:*", {
      parse_mode: "Markdown",
      ...mainMenu,
    });
  });
}
