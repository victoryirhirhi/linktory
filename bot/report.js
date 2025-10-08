// bot/report.js
import { replaceReply } from "../utils/helpers.js";

export default function reportCommand(bot, pool) {
  bot.action("ACTION_REPORT", async (ctx) => {
    await ctx.answerCbQuery();
    await replaceReply(ctx, "🚨 Paste the *link you want to report*:", {
      parse_mode: "Markdown",
    });

    bot.once("text", async (ctx2) => {
      const link = ctx2.message.text.trim();

      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);

      let linkId;
      if (rows.length === 0) {
        // Auto-add the link and mark as "reported"
        const inserted = await pool.query(
          "INSERT INTO links (url, submitted_by, status) VALUES ($1, $2, 'reported') RETURNING id",
          [link, ctx2.from.id]
        );
        linkId = inserted.rows[0].id;
      } else {
        linkId = rows[0].id;
      }

      await pool.query(
        "INSERT INTO reports (link_id, reported_by, reason) VALUES ($1, $2, $3)",
        [linkId, ctx2.from.id, "User report"]
      );

      ctx2.reply(`⚠️ Report submitted for link #${linkId}`);
    });
  });
}
