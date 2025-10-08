export function setupLeaderboard(bot, pool) {
  bot.action("ACTION_LEADERBOARD", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});

    const result = await pool.query(`
      SELECT added_by, COUNT(*) AS total
      FROM links
      GROUP BY added_by
      ORDER BY total DESC
      LIMIT 10
    `);

    if (result.rowCount === 0) {
      await ctx.reply("😕 No links added yet!");
      return;
    }

    const leaderboard = result.rows
      .map((r, i) => `${i + 1}. <b>${r.added_by}</b> — ${r.total} links`)
      .join("\n");

    await ctx.reply(`🏆 Top Contributors:\n\n${leaderboard}`, { parse_mode: "HTML" });
  });
}
