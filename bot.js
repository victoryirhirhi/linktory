import { Telegraf } from "telegraf";
import pkg from "pg";
const { Pool } = pkg;

// Connect DB
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Init bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// /start command
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || "unknown";

  await pool.query(
    "INSERT INTO users (telegram_id, username, points, trust_score) VALUES ($1, $2, 0, 100) ON CONFLICT (telegram_id) DO NOTHING",
    [userId, username]
  );

  ctx.reply("🚀 Welcome to Linktory!\n\nUse /add <link> to submit a link and earn points.");
});

// /add <link>
bot.command("add", async (ctx) => {
  const parts = ctx.message.text.split(" ");
  const link = parts[1];

  if (!link) return ctx.reply("⚠️ Usage: /add <link>");

  // check duplicate
  const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
  if (rows.length > 0) {
    return ctx.reply("❌ This link already exists in Linktory.");
  }

  // insert
  await pool.query(
    "INSERT INTO links (url, submitted_by, status) VALUES ($1, $2, 'pending')",
    [link, ctx.from.id]
  );
  await pool.query(
    "UPDATE users SET points = points + 10 WHERE telegram_id=$1",
    [ctx.from.id]
  );

  ctx.reply(`✅ Link added: ${link}\n+10 points earned!`);
});

// /report <link_id> <reason>
bot.command("report", async (ctx) => {
  const parts = ctx.message.text.split(" ");
  const linkId = parts[1];
  const reason = parts.slice(2).join(" ") || "No reason";

  if (!linkId) return ctx.reply("⚠️ Usage: /report <link_id> <reason>");

  await pool.query(
    "INSERT INTO reports (link_id, reported_by, reason) VALUES ($1, $2, $3)",
    [linkId, ctx.from.id, reason]
  );

  ctx.reply(`⚠️ Report submitted for link #${linkId}.\nReason: ${reason}`);
});

// /check <link>
bot.command("check", async (ctx) => {
  const parts = ctx.message.text.split(" ");
  const link = parts[1];

  if (!link) return ctx.reply("⚠️ Usage: /check <link>");

  const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);

  if (rows.length === 0) {
    return ctx.reply("❌ No record found. Add it with /add <link>");
  }

  ctx.reply(`ℹ️ Link found:\nID: ${rows[0].id}\nStatus: ${rows[0].status}`);
});

// /leaderboard
bot.command("leaderboard", async (ctx) => {
  const { rows } = await pool.query(
    "SELECT username, points FROM users ORDER BY points DESC LIMIT 10"
  );

  let message = "🏆 Top Contributors:\n\n";
  rows.forEach((u, i) => {
    message += `${i + 1}. ${u.username} — ${u.points} pts\n`;
  });

  ctx.reply(message);
});

// launch
bot.launch();
