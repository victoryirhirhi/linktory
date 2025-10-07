export default (bot, pool) => {
    bot.command("leaderboard", async (ctx) => {
      const { rows } = await pool.query(
        "SELECT username, points FROM users ORDER BY points DESC LIMIT 10"
      );
  
      let message = "🏆 Top Contributors:\n\n";
      rows.forEach((u, i) => {
        message += `${i + 1}. ${u.username} — ${u.points} pts\n`;
      });
  
      ctx.reply(message);
    });
  };
  