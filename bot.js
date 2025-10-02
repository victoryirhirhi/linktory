import { Telegraf } from "telegraf";
import pkg from "pg";

const { Pool } = pkg;

// ===== CONFIG =====
const BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN";
const bot = new Telegraf(BOT_TOKEN);
const db = new Pool({
  connectionString: "postgres://username:password@localhost:5432/linktory"
});

// ===== HELPERS =====
async function ensureUser(user) {
  await db.query(
    `INSERT INTO users (telegram_id, username, points, trust_score)
     VALUES ($1, $2, 0, 100)
     ON CONFLICT (telegram_id) DO NOTHING`,
    [user.id, user.username || `user${user.id}`]
  );
}

async function addPoints(userId, action) {
  let points = 0;
  switch (action) {
    case "add_link": points = 2; break;
    case "report_link": points = 3; break;
    case "comment_link": points = 1; break;
    case "daily_bonus": points = 1; break;
    case "referral": points = 5; break;
  }
  await db.query("UPDATE users SET points = points + $1 WHERE telegram_id=$2", [points, userId]);
}

async function updateTrust(userId, action) {
  let change = 0;
  switch (action) {
    case "approved_link": change = 2; break;
    case "valid_report": change = 5; break;
    case "false_report": change = -10; break;
    case "spam_link": change = -20; break;
    case "cheat": change = -50; break;
  }
  await db.query(
    "UPDATE users SET trust_score = GREATEST(0, LEAST(200, trust_score + $1)) WHERE telegram_id=$2",
    [change, userId]
  );
}

function getBadge(trust, points) {
  if (trust >= 150 && points >= 1000) return "👑 Elite";
  if (trust >= 120) return "🥇 Gold";
  if (trust >= 100) return "🥈 Silver";
  if (trust >= 80) return "🥉 Bronze";
  if (trust < 50) return "⚠️ Low Credibility";
  return "🌱 Newbie";
}

// ===== COMMANDS =====
bot.start(async (ctx) => {
  await ensureUser(ctx.from);
  ctx.reply("👋 Welcome to Linktory! Use /add, /search, /report, /comment, /daily, /top, /trustboard, /me");
});

// Add link
bot.command("add", async (ctx) => {
  const url = ctx.message.text.split(" ")[1];
  if (!url) return ctx.reply("⚠️ Usage: /add <link>");
  await ensureUser(ctx.from);

  const { rows } = await db.query("SELECT * FROM links WHERE url=$1", [url]);
  if (rows.length > 0) return ctx.reply("⚠️ Link already exists!");

  await db.query("INSERT INTO links (url, added_by) VALUES ($1,$2)", [url, ctx.from.id]);
  await addPoints(ctx.from.id, "add_link");
  await updateTrust(ctx.from.id, "approved_link");

  ctx.reply(`✅ Link added! (+2 pts, +2 Trust)`);
});

// Search
bot.command("search", async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply("⚠️ Usage: /search <keyword>");
  const { rows } = await db.query("SELECT url FROM links WHERE url ILIKE $1 LIMIT 5", [`%${q}%`]);
  if (!rows.length) return ctx.reply("❌ No links found.");
  ctx.reply("🔎 Results:\n" + rows.map(r => r.url).join("\n"));
});

// Report
bot.command("report", async (ctx) => {
  const url = ctx.message.text.split(" ")[1];
  if (!url) return ctx.reply("⚠️ Usage: /report <link>");
  await ensureUser(ctx.from);

  const link = await db.query("SELECT added_by FROM links WHERE url=$1", [url]);
  if (!link.rows.length) return ctx.reply("❌ Link not found.");
  if (link.rows[0].added_by == ctx.from.id) return ctx.reply("⛔ You can’t report your own link!");

  await db.query("INSERT INTO reports (url, reported_by) VALUES ($1,$2)", [url, ctx.from.id]);
  await addPoints(ctx.from.id, "report_link");

  ctx.reply("🚨 Scam report submitted! (+3 pts) Pending moderator review.");
});

// Comment
bot.command("comment", async (ctx) => {
  const args = ctx.message.text.split(" ");
  const url = args[1];
  const text = args.slice(2).join(" ");
  if (!url || !text) return ctx.reply("⚠️ Usage: /comment <link> <text>");
  await ensureUser(ctx.from);

  const { rows } = await db.query(
    "SELECT COUNT(*) FROM comments WHERE url=$1 AND user_id=$2",
    [url, ctx.from.id]
  );
  if (parseInt(rows[0].count) >= 3) return ctx.reply("⚠️ You already commented 3 times on this link.");

  await db.query("INSERT INTO comments (url, user_id, text) VALUES ($1,$2,$3)", [url, ctx.from.id, text]);
  await addPoints(ctx.from.id, "comment_link");

  ctx.reply("💬 Comment added! (+1 pt)");
});

// Daily
bot.command("daily", async (ctx) => {
  await ensureUser(ctx.from);
  const { rows } = await db.query("SELECT last_daily FROM users WHERE telegram_id=$1", [ctx.from.id]);
  const last = rows[0].last_daily;
  const today = new Date().toISOString().split("T")[0];
  if (last === today) return ctx.reply("⏳ Already claimed today.");
  await db.query("UPDATE users SET points=points+1,last_daily=$2 WHERE telegram_id=$1", [ctx.from.id, today]);
  ctx.reply("🎁 Daily bonus claimed! (+1 pt)");
});

// Leaderboards
bot.command("top", async (ctx) => {
  const { rows } = await db.query("SELECT username, points FROM users ORDER BY points DESC LIMIT 10");
  let msg = "🏆 Top Contributors\n";
  rows.forEach((u,i)=> msg+=`${i+1}. ${u.username} — ${u.points} pts\n`);
  ctx.reply(msg);
});

bot.command("trustboard", async (ctx) => {
  const { rows } = await db.query("SELECT username, trust_score FROM users ORDER BY trust_score DESC LIMIT 10");
  let msg = "🌟 Top Trusted Users\n";
  rows.forEach((u,i)=> msg+=`${i+1}. ${u.username} — Trust ${u.trust_score}\n`);
  ctx.reply(msg);
});

// Profile
bot.command("me", async (ctx) => {
  await ensureUser(ctx.from);
  const { rows } = await db.query("SELECT username, points, trust_score FROM users WHERE telegram_id=$1", [ctx.from.id]);
  const u = rows[0];
  const badge = getBadge(u.trust_score, u.points);
  ctx.reply(`👤 ${u.username}\n🏆 Points: ${u.points}\n🌟 Trust: ${u.trust_score}\n🎖 Badge: ${badge}`);
});

// ===== START =====
bot.launch();
console.log("🚀 Linktory Bot running...");
