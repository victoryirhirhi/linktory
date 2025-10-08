export const checkCommand = (bot, pool) => {
  bot.command("check", async (ctx) => {
    const parts = ctx.message.text.split(" ");
    const link = parts[1];

    if (!link) return ctx.reply("⚠️ Usage: /check <link>");

    try {
      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);

      if (rows.length === 0) {
        return ctx.reply("❌ No record found. Add it with /add <link>");
      }

      const data = rows[0];
      ctx.reply(
        `🔍 Link found:\n\nURL: ${data.url}\nStatus: ${data.status}\nSubmitted by: ${data.submitted_by}`
      );
    } catch (err) {
      console.error(err);
      ctx.reply("❌ Error checking link. Please try again later.");
    }
  });
};
