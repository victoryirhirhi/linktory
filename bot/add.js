// bot/add.js
import { replaceReply } from "../utils/helpers.js";

export default function addCommand(bot, pool) {
  // Menu button handler
  bot.action("ACTION_ADD", async (ctx) => {
    await ctx.answerCbQuery();
    await replaceReply(ctx, "📎 Please *paste the link* you want to add:", {
      parse_mode: "Markdown",
    });

    bot.once("text", async (ctx2) => {
      const link = ctx2.message.text.trim();

      const exists = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
      if (exists.rows.length > 0) {
        return ctx2.reply("❌ This link already exists in Linktory.");
      }

      await pool.query(
        "INSERT INTO links (url, submitted_by, status) VALUES ($1, $2, 'pending')",
        [link, ctx2.from.id]
      );

      await pool.query(
        "UPDATE users SET points = points + 10 WHERE telegram_id=$1",
        [ctx2.from.id]
      );

      ctx2.reply(`✅ Link added successfully:\n${link}\n\n+10 points earned!`);
    });
  });
}
