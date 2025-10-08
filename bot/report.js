export const reportCommand = (bot, pool) => {
  bot.command("report", async (ctx) => {
    const parts = ctx.message.text.split(" ");
    const linkId = parts[1];
    const reason = parts.slice(2).join(" ") || "No reason provided.";

    if (!linkId) return ctx.reply("⚠️ Usage: /report <link_id> <reason>");

    try {
      await pool.query(
        "INSERT INTO reports (link_id, reported_by, reason) VALUES ($1, $2, $3)",
        [linkId, ctx.from.id, reason]
      );

      ctx.reply(`⚠️ Report submitted for link #${linkId}.\nReason: ${reason}`);
    } catch (err) {
      console.error(err);
      ctx.reply("❌ Failed to submit report. Please try again later.");
    }
  });
};
