export default function checkCommand(bot, pool) {
  bot.command("check", async (ctx) => {
    await ctx.reply("🔍 Please send the link you want to check:");

    const userId = ctx.from.id;

    const onText = async (ctx2) => {
      if (ctx2.from.id !== userId) return;

      const link = ctx2.message.text;

      try {
        const result = await pool.query("SELECT * FROM links WHERE url = $1", [link]);
        const reports = await pool.query("SELECT COUNT(*) FROM reports WHERE url = $1", [link]);

        if (result.rows.length === 0) {
          await ctx2.reply(`⚠️ No record found for:\n${link}`);
        } else {
          await ctx2.reply(
            `✅ Verified link found!\n\nAdded by: ${result.rows[0].added_by}\nReports: ${reports.rows[0].count}`
          );
        }
      } catch (err) {
        console.error(err);
        await ctx2.reply("⚠️ Database error while checking link.");
      }

      bot.context.textHandlers = bot.context.textHandlers?.filter((h) => h !== onText);
    };

    if (!bot.context.textHandlers) bot.context.textHandlers = [];
    bot.context.textHandlers.push(onText);
  });

  bot.on("text", async (ctx) => {
    if (!bot.context.textHandlers?.length) return;
    for (const handler of bot.context.textHandlers) {
      await handler(ctx);
    }
  });
}
