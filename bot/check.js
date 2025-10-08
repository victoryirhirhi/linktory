export default function checkCommand(bot, pool) {
  bot.command("check", async (ctx) => {
    const parts = ctx.message.text.split(" ");
    const link = parts[1];

    if (!link) return ctx.reply("⚠️ Usage: /check <link>");

    const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
    if (rows.length === 0) return ctx.reply("❌ No record found. Add it with /add <link>");

    const data = rows[0];
    ctx.reply(
      `ℹ️ Link Info:\n` +
      `ID: ${data.id}\n` +
      `Status: ${data.status}\n` +
      `✅ Legit votes: ${data.legit_votes}\n` +
      `🚨 Scam votes: ${data.scam_votes}`
    );
  });
}
