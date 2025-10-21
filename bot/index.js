// bot/index.js
import startCommand from "./start.js";
import addCommand from "./add.js";
import checkCommand from "./check.js";
import leaderboardCommand from "./leaderboard.js";
import reportCommand from "./report.js";

export function setupBot(bot, pool) {
  startCommand(bot, pool);
  addCommand(bot, pool);
  checkCommand(bot, pool);
  leaderboardCommand(bot, pool);
  reportCommand(bot, pool);

  console.log("✅ All bot modules initialized successfully");
}
