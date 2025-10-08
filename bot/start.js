export default function startCommand(bot, pool) {
  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || "unknown";

    await pool.query(
      "INSERT INTO users (telegram_id, username, points, trust_score) VALUES ($1, $2, 0, 100) ON CONFLICT (telegram_id) DO NOTHING",
      [userId, username]
    );

    ctx.reply(
      "🚀 Welcome to Linktory!\n\n" +
      "Use these commands:\n" +
      "🔗 /add <link> — Submit a new link\n" +
      "🧾 /check <link> — Check link status\n" +
      "⚠️ /report <id> <reason> — Report a link\n" +
      "🗳️ /vote <id> legit|scam — Vote on links\n" +
      "🏆 /leaderboard — View top users"
    );
  });
}
