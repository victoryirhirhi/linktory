// bot/leaderboard.js
export default function leaderboardCommand(bot, pool) {
  bot.action("ACTION_LEADERBOARD", async (ctx) => {
    await ctx.answerCbQuery();

    const { rows } = await pool.query(
      "SELECT username, points FROM users ORDER BY points DESC LIMIT 10"
    );

    let message = "🏆 *Top Contributors:*\n\n";
    rows.forEach((u, i) => {
      message += `${i + 1}. ${u.username} — ${u.points} pts\n`;
    });

    await ctx.reply(message, { parse_mode: "Markdown" });
  });
}
