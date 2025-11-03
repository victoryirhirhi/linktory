// bot/index.js
import { setupStart } from "./start.js";
import { setupAdd } from "./add.js";
import { setupCheck } from "./check.js";
import { setupLeaderboard } from "./leaderboard.js";
import { setupReport } from "./report.js";

export function setupBot(bot, pool) {
  setupStart(bot, pool);
  setupAdd(bot, pool);
  setupCheck(bot, pool);
  setupLeaderboard(bot, pool);
  setupReport(bot, pool);
}
bot.start(async (ctx) => {
  const webAppUrl = `${process.env.RENDER_EXTERNAL_URL}/webapp`;
  
  await ctx.reply("🚀 Welcome to Linktory!", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Open Linktory App",
            web_app: { url: webAppUrl }
          }
        ]
      ]
    }
  });
});

