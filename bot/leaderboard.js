export const leaderboardCommand = (bot, pool) => {
  bot.command("leaderboard", async (ctx) => {
    try {
      const { rows } = await pool.query(
        "SELECT username, points FROM users ORDER BY points DESC LIMIT 10"
      );

      if (rows.length === 0) return ctx.reply("📊 No users found yet.");

      let message = "🏆 Top Contributors:\n\n";
      rows.forEach((u, i) => {
        message += `${i + 1}. ${u.username} — ${u.points} pts\n`;
      });

      ctx.reply(message);
    } catch (err) {
      console.error(err);
      ctx.reply("❌ Error loading leaderboard. Try again later.");
    }
  });
};
