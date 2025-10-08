// bot/add.js
import { Markup } from "telegraf";

export default function setupAddCommand(bot, pool) {
  bot.action("ACTION_ADD", async (ctx) => {
    // Delete old message to keep chat clean
    try {
      await ctx.deleteMessage();
    } catch (err) {}

    await ctx.reply("🔗 Please send the link you want to add:");

    // Set up a one-time listener for this user’s next message
    const userId = ctx.from.id;

    const onText = async (msgCtx) => {
      if (msgCtx.from.id !== userId) return; // ignore others

      const link = msgCtx.message.text.trim();
      if (!link.startsWith("http")) {
        await msgCtx.reply("⚠️ Please send a valid URL starting with http or https.");
        return;
      }

      try {
        const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
        if (rows.length > 0) {
          await msgCtx.reply("❌ This link already exists in Linktory.");
        } else {
          await pool.query(
            "INSERT INTO links (url, submitted_by, status) VALUES ($1, $2, 'pending')",
            [link, userId]
          );
          await pool.query(
            "UPDATE users SET points = points + 10 WHERE telegram_id=$1",
            [userId]
          );
          await msgCtx.reply(`✅ Link added: ${link}\n+10 points earned!`);
        }
      } catch (err) {
        console.error("Database error:", err);
        await msgCtx.reply("❌ Database error, please try again later.");
      }

      // Remove listener after processing
      bot.off("text", onText);
    };

    // Register temporary listener
    bot.on("text", onText);
  });
}
