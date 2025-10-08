export const startCommand = (bot, pool) => {
  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || "unknown";

    try {
      await pool.query(
        "INSERT INTO users (telegram_id, username, points, trust_score) VALUES ($1, $2, 0, 100) ON CONFLICT (telegram_id) DO NOTHING",
        [userId, username]
      );

      ctx.reply(
        "🚀 Welcome to Linktory!\n\nUse /add <link> to submit a link and earn points.\nUse /check <link> to verify if a link is legit or scam."
      );
    } catch (err) {
      console.error(err);
      ctx.reply("❌ Something went wrong. Please try again later.");
    }
  });
};
