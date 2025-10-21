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
