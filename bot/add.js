export default function addCommand(bot, pool) {
  bot.command("add", async (ctx) => {
    await ctx.reply("📎 Please send the link you want to add:");

    const userId = ctx.from.id;

    const onText = async (ctx2) => {
      if (ctx2.from.id !== userId) return;

      const link = ctx2.message.text;

      try {
        await pool.query("INSERT INTO links (url, added_by) VALUES ($1, $2)", [
          link,
          ctx2.from.username || ctx2.from.id,
        ]);
        await ctx2.reply(`✅ Link added successfully:\n${link}`);
      } catch (err) {
        console.error(err);
        await ctx2.reply("⚠️ Error adding link. It may already exist.");
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
