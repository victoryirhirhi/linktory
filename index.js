import { Telegraf } from "telegraf";
//import dotenv from "dotenv";
import { pool } from "./config/db.js";
import startCommand from "./bot/start.js";
import addCommand from "./bot/add.js";
import reportCommand from "./bot/report.js";
import checkCommand from "./bot/check.js";
import leaderboardCommand from "./bot/leaderboard.js";

//dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// Commands
startCommand(bot, pool);
addCommand(bot, pool);
reportCommand(bot, pool);
checkCommand(bot, pool);
leaderboardCommand(bot, pool);

// Launch bot
bot.launch();

console.log("✅ Linktory bot is running...");

