export function setupReport(bot, pool) {
  bot.action("ACTION_REPORT", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply("🚨 Send the link you want to report as a scam or issue:");

    const handler = async (ctx2) => {
      const url = ctx2.message.text.trim();
      await pool.query("INSERT INTO reports (url, reported_by) VALUES ($1, $2)", [url, ctx2.from.id]);
      await ctx2.reply("⚠️ Thank you! The link has been reported and will be reviewed.");
      bot.off("text", handler);
    };

    bot.on("text", handler);
  });
}
