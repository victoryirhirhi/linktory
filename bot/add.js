export function setupAdd(bot, pool) {
  bot.action("ACTION_ADD", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    const msg = await ctx.reply("🔗 Send the link you want to add:");

    const handler = async (ctx2) => {
      const url = ctx2.message.text.trim();
      if (!/^https?:\/\//i.test(url)) {
        await ctx2.reply("❌ Invalid URL. Please send a valid link starting with http:// or https://");
        return;
      }

      await pool.query("INSERT INTO links (url, added_by) VALUES ($1, $2)", [url, ctx2.from.id]);
      await ctx2.reply("✅ Link successfully added to Linktory!");
      bot.off("text", handler);
    };

    bot.on("text", handler);
  });
}
