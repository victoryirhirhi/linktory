export default function addCommand(bot, pool) {
  bot.command("add", async (ctx) => {
    const parts = ctx.message.text.split(" ");
    const link = parts[1];

    if (!link) return ctx.reply("⚠️ Usage: /add <link>");

    const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
    if (rows.length > 0) return ctx.reply("❌ This link already exists in Linktory.");

    await pool.query(
      "INSERT INTO links (url, submitted_by, status, legit_votes, scam_votes) VALUES ($1, $2, 'pending', 0, 0)",
      [link, ctx.from.id]
    );
    await pool.query("UPDATE users SET points = points + 10 WHERE telegram_id=$1", [ctx.from.id]);

    ctx.reply(`✅ Link added: ${link}\n+10 points earned!`);
  });
}
