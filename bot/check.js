// bot/check.js
import { replaceReply } from "../utils/helpers.js";

export default function checkCommand(bot, pool) {
  bot.action("ACTION_CHECK", async (ctx) => {
    await ctx.answerCbQuery();
    await replaceReply(ctx, "🔍 Send the link you want to *check*:", {
      parse_mode: "Markdown",
    });

    bot.once("text", async (ctx2) => {
      const link = ctx2.message.text.trim();
      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);

      if (rows.length === 0) {
        return ctx2.reply("❌ No record found. You can add it using the Add Link button.");
      }

      ctx2.reply(`ℹ️ *Link found:*\n\nStatus: ${rows[0].status}`, {
        parse_mode: "Markdown",
      });
    });
  });
}
