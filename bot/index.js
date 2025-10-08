import startCommand from "./start.js";
import addCommand from "./add.js";
import checkCommand from "./check.js";
import reportCommand from "./report.js";
import leaderboardCommand from "./leaderboard.js";

export function setupBot(bot, pool) {
  startCommand(bot, pool);
  addCommand(bot, pool);
  checkCommand(bot, pool);
  reportCommand(bot, pool);
  leaderboardCommand(bot, pool);

  // ✅ Add voting system here
  bot.command("vote", async (ctx) => {
    const parts = ctx.message.text.split(" ");
    const linkId = parts[1];
    const voteType = parts[2];

    if (!linkId || !["legit", "scam"].includes(voteType)) {
      return ctx.reply("⚠️ Usage: /vote <link_id> legit|scam");
    }

    const column = voteType === "legit" ? "legit_votes" : "scam_votes";
    await pool.query(`UPDATE links SET ${column} = ${column} + 1 WHERE id=$1`, [linkId]);

    ctx.reply(`🗳️ Your vote for link #${linkId} has been recorded as ${voteType.toUpperCase()}.`);
  });
}
