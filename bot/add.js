export default function addCommand(bot, pool) {
  bot.command("add", async (ctx) => {
    await ctx.reply("📎 Please send the link you want to add:");

    const userId = ctx.from.id;

    // Create a handler scoped to this user
    const onText = async (ctx2) => {
      if (ctx2.from.id !== userId) return; // Ignore others

      const link = ctx2.message.text;

      try {
        await pool.query("INSERT INTO links (url, added_by) VALUES ($1, $2)", [
          link,
          ctx2.from.username || ctx2.from.id,
        ]);

        await ctx2.reply(`✅ Link added successfully:\n${link}`);
      } catch (err) {
        console.error(err);
        await ctx2.reply("⚠️ Error adding link. Maybe it already exists?");
      }

      // Remove this listener AFTER it runs once
      bot.context.textHandlers = bot.context.textHandlers?.filter((h) => h !== onText);
    };

    // Save the handler
    if (!bot.context.textHandlers) bot.context.textHandlers = [];
    bot.context.textHandlers.push(onText);
  });

  // Global listener for text input
  bot.on("text", async (ctx) => {
    if (!bot.context.textHandlers || bot.context.textHandlers.length === 0) return;
    for (const handler of bot.context.textHandlers) {
      await handler(ctx);
    }
  });
}
