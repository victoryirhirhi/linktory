// Force Node.js to prefer IPv4 over IPv6
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import { Telegraf } from "telegraf";
import express from "express";
import pkg from "pg";
import crypto from "crypto";

const { Pool } = pkg;

// === DB Connection ===
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  host: "db.lkdblvkkupbelhsoaeia.supabase.co", // force IPv4
  port: 5432
});

// === Init Bot ===
const bot = new Telegraf(process.env.BOT_TOKEN);

// === /start ===
bot.start(async (ctx) => {
  try {
    const userId = ctx.from.id;
    const username = ctx.from.username || "unknown";

    await pool.query(
      "INSERT INTO users (telegram_id, username, points, trust_score) VALUES ($1, $2, 0, 100) ON CONFLICT (telegram_id) DO NOTHING",
      [userId, username]
    );

    ctx.reply("🚀 Welcome to Linktory!\n\nUse /add <link> to submit a link and earn points.\nType /help to see all commands.");
  } catch (err) {
    console.error("DB error on /start:", err.message);
    ctx.reply("⚠️ Welcome to Linktory! (Database temporarily unavailable)");
  }
});

// === /help or /commands ===
bot.command(["help", "commands"], (ctx) => {
  const message = `
📜 *Linktory Commands:*

/start - Register and get points  
/add <link> - Add a new link (or just /add and I will ask for it)  
/report <link_id> <reason> - Report a suspicious link (will prompt if missing)  
/check <link> - Check if a link exists (will prompt if missing)  
/leaderboard - Show top contributors  
/help or /commands - Show this message
  `;
  ctx.reply(message, { parse_mode: "Markdown" });
});

// === /add <link> ===
bot.command("add", async (ctx) => {
  try {
    const parts = ctx.message.text.split(" ");
    let link = parts[1];

    if (!link) {
      ctx.reply("⚠️ Please send the link you want to add.");
      const handler = async (replyCtx) => {
        if (replyCtx.from.id === ctx.from.id) {
          link = replyCtx.message.text;
          bot.off("text", handler);
          await addLink(replyCtx, link);
        }
      };
      bot.on("text", handler);
      return;
    }

    await addLink(ctx, link);
  } catch (err) {
    console.error("DB error on /add:", err.message);
    ctx.reply("⚠️ Could not add link (DB error). Try again later.");
  }
});

// Helper function to safely add link with public_id
async function addLink(ctx, link) {
  try {
    const publicId = crypto.randomBytes(4).toString("hex"); // 8-char hex ID

    await pool.query(
      "INSERT INTO links (url, submitted_by, status, public_id) VALUES ($1, $2, 'pending', $3)",
      [link, ctx.from.id, publicId]
    );
    await pool.query(
      "UPDATE users SET points = points + 10 WHERE telegram_id=$1",
      [ctx.from.id]
    );

    ctx.reply(`✅ Link added: ${link}\nLink ID: ${publicId}\n+10 points earned!`);
  } catch (err) {
    if (err.code === "23505") { // unique_violation
      ctx.reply("❌ This link already exists in Linktory.");
    } else {
      console.error("DB error in addLink:", err.message);
      ctx.reply("⚠️ Could not add link (DB error). Try again later.");
    }
  }
}

// === /report <link_id> <reason> ===
bot.command("report", async (ctx) => {
  try {
    const parts = ctx.message.text.split(" ");
    let linkId = parts[1];
    let reason = parts.slice(2).join(" ");

    if (!linkId) {
      ctx.reply("⚠️ Please send the Link ID you want to report.");
      const handler = async (replyCtx) => {
        if (replyCtx.from.id === ctx.from.id) {
          linkId = replyCtx.message.text;
          bot.off("text", handler);

          ctx.reply("⚠️ Please provide the reason for reporting this link.");
          const reasonHandler = async (reasonCtx) => {
            if (reasonCtx.from.id === ctx.from.id) {
              reason = reasonCtx.message.text;
              bot.off("text", reasonHandler);

              await pool.query(
                "INSERT INTO reports (link_id, reported_by, reason) VALUES ((SELECT id FROM links WHERE public_id=$1), $2, $3)",
                [linkId, ctx.from.id, reason || "No reason"]
              );
              reasonCtx.reply(`⚠️ Report submitted for link ${linkId}.\nReason: ${reason}`);
            }
          };
          bot.on("text", reasonHandler);
        }
      };
      bot.on("text", handler);
      return;
    }

    if (!reason) reason = "No reason";

    await pool.query(
      "INSERT INTO reports (link_id, reported_by, reason) VALUES ((SELECT id FROM links WHERE public_id=$1), $2, $3)",
      [linkId, ctx.from.id, reason]
    );

    ctx.reply(`⚠️ Report submitted for link ${linkId}.\nReason: ${reason}`);
  } catch (err) {
    console.error("DB error on /report:", err.message);
    ctx.reply("⚠️ Could not submit report (DB error). Try again later.");
  }
});

// === /check <link> ===
bot.command("check", async (ctx) => {
  try {
    const parts = ctx.message.text.split(" ");
    let link = parts[1];

    if (!link) {
      ctx.reply("⚠️ Please send the link you want to check.");
      const handler = async (replyCtx) => {
        if (replyCtx.from.id === ctx.from.id) {
          link = replyCtx.message.text;
          bot.off("text", handler);

          const { rows } = await pool.query("SELECT * FROM links WHERE url=$1 OR public_id=$1", [link]);
          if (rows.length === 0) return replyCtx.reply("❌ No record found. Add it with /add <link>");

          replyCtx.reply(`ℹ️ Link found:\nLink ID: ${rows[0].public_id}\nStatus: ${rows[0].status}`);
        }
      };
      bot.on("text", handler);
      return;
    }

    const { rows } = await pool.query("SELECT * FROM links WHERE url=$1 OR public_id=$1", [link]);
    if (rows.length === 0) return ctx.reply("❌ No record found. Add it with /add <link>");

    ctx.reply(`ℹ️ Link found:\nLink ID: ${rows[0].public_id}\nStatus: ${rows[0].status}`);
  } catch (err) {
    console.error("DB error on /check:", err.message);
    ctx.reply("⚠️ Could not check link (DB error). Try again later.");
  }
});

// === /leaderboard ===
bot.command("leaderboard", async (ctx) => {
  try {
    const { rows } = await pool.query(
      "SELECT username, points FROM users ORDER BY points DESC LIMIT 10"
    );

    let message = "🏆 Top Contributors:\n\n";
    rows.forEach((u, i) => {
      message += `${i + 1}. ${u.username} — ${u.points} pts\n`;
    });

    ctx.reply(message);
  } catch (err) {
    console.error("DB error on /leaderboard:", err.message);
    ctx.reply("⚠️ Could not load leaderboard (DB error). Try again later.");
  }
});

// === Webhook Setup ===
const app = express();
app.use(bot.webhookCallback("/webhook"));

// Health check endpoints
app.get("/", (req, res) => res.send("✅ Linktory bot is running!"));
app.get("/health", async (req, res) => {
  try {
    const dbCheck = await pool.query("SELECT NOW()");
    res.json({ status: "ok", db_time: dbCheck.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// === Start server ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);

  const url = process.env.RENDER_EXTERNAL_URL;
  if (url) {
    await bot.telegram.setWebhook(`${url}/webhook`);
    console.log(`✅ Webhook set to ${url}/webhook`);
  }
});
