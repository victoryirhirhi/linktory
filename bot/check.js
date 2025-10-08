export function setupCheck(bot, pool) {
  bot.action("ACTION_CHECK", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply("🔎 Send the link you want to verify:");

    const handler = async (ctx2) => {
      const url = ctx2.message.text.trim();
      const result = await pool.query("SELECT * FROM links WHERE url = $1", [url]);

      if (result.rowCount > 0) {
        await ctx2.reply(`✅ This link is already in Linktory.\n\n🧠 Added by: <code>${result.rows[0].added_by}</code>`, { parse_mode: "HTML" });
      } else {
        await ctx2.reply("⚠️ This link has not been added yet.");
      }
      bot.off("text", handler);
    };

    bot.on("text", handler);
  });
}
