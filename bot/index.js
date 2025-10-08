// bot/index.js
import startCommand from "./start.js";
import addCommand from "./add.js";
import checkCommand from "./check.js";
import reportCommand from "./report.js";
import leaderboardCommand from "./leaderboard.js";
import dashboardCommand from "./dashboard.js";

export function setupBot(bot, pool) {
  startCommand(bot, pool);
  addCommand(bot, pool);
  checkCommand(bot, pool);
  reportCommand(bot, pool);
  leaderboardCommand(bot, pool);
  dashboardCommand(bot, pool);
}
