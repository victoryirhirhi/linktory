import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import { Telegraf, Markup, session } from "telegraf";
import express from "express";
import pkg from "pg";
import crypto from "crypto";

const { Pool } = pkg;

// === DB Connection ===
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  host: "db.lkdblvkkupbelhsoaeia.supabase.co",
  port: 5432
});

// === Init Bot ===
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

// === Helper Functions ===
function generateHiddenId() {
  return crypto.randomBytes(4).toString("hex"); // 8-char hex
}

function extractLink(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  return matches ? matches[0] : null;
}

// === /start Command ===
bot.start(async (ctx) => {
  try {
    const userId = ctx.from.id;
    const username = ctx.from.username || "unknown";
    const parts = ctx.message.text.split(" ");
    const referrerLink = parts[1];

    let referrerId = null;
    if (referrerLink) {
      const refId = parseInt(referrerLink);
      if (!isNaN(refId)) {
        const { rows } = await pool.query(
          "SELECT telegram_id FROM users WHERE telegram_id=$1",
          [refId]
        );
        if (rows.length > 0) referrerId = rows[0].telegram_id;
      }
    }

    await pool.query(
      `INSERT INTO users (telegram_id, username, points, trust_score, referrer_id)
       VALUES ($1, $2, 0, 100, $3)
       ON CONFLICT (telegram_id) DO NOTHING`,
      [userId, username, referrerId]
    );

    if (referrerId) {
      await pool.query(
        "UPDATE users SET points = points + 20 WHERE telegram_id=$1",
        [referrerId]
      );
      ctx.reply("🎉 You were referred! Referrer earned 20 points!");
    }

    ctx.reply(
      "🚀 Welcome to Linktory! Use the buttons below to interact with the bot.",
      Markup.keyboard([["Add Link", "Report Link"], ["Check Link", "Dashboard"]]).resize()
    );
  } catch (err) {
    console.error("DB error on /start:", err.message);
    ctx.reply("⚠️ Welcome to Linktory! (Database temporarily unavailable)");
  }
});

// === Button Actions ===
bot.hears("Add Link", (ctx) => {
  ctx.session.awaitingLink = true;
  ctx.reply("📎 Please send the link you want to add.");
});

bot.hears("Check Link", (ctx) => {
  ctx.session.awaitingCheck = true;
  ctx.reply("🔍 Please send the link you want to check.");
});

bot.hears("Report Link", (ctx) => {
  ctx.session.awaitingReport = true;
  ctx.reply("⚠️ Please send the link and reason to report (e.g., <link> <reason>).");
});

bot.hears("Dashboard", async (ctx) => {
  ctx.reply(
    "📊 Your Dashboard:",
    Markup.inlineKeyboard([
      [Markup.button.callback("💰 Points", "DASHBOARD_POINTS")],
      [Markup.button.callback("🔗 Links Submitted", "DASHBOARD_LINKS")],
      [Markup.button.callback("👥 Friends Invited", "DASHBOARD_FRIENDS")],
      [Markup.button.callback("🔗 Referral Link", "DASHBOARD_REFERRAL")]
    ])
  );
});

// === Dashboard Callbacks ===
bot.action("DASHBOARD_POINTS", async (ctx) => {
  const userId = ctx.from.id;
  const { rows } = await pool.query("SELECT points FROM users WHERE telegram_id=$1", [userId]);
  await ctx.answerCbQuery();
  ctx.reply(`💰 Your Points: ${rows[0].points}`);
});

bot.action("DASHBOARD_LINKS", async (ctx) => {
  const userId = ctx.from.id;
  const { rows } = await pool.query("SELECT COUNT(*) FROM links WHERE submitted_by=$1", [userId]);
  await ctx.answerCbQuery();
  ctx.reply(`🔗 Links Submitted: ${rows[0].count}`);
});

bot.action("DASHBOARD_FRIENDS", async (ctx) => {
  const userId = ctx.from.id;
  const { rows } = await pool.query("SELECT COUNT(*) FROM users WHERE referrer_id=$1", [userId]);
  await ctx.answerCbQuery();
  ctx.reply(`👥 Friends Invited: ${rows[0].count}`);
});

bot.action("DASHBOARD_REFERRAL", async (ctx) => {
  const userId = ctx.from.id;
  const referralLink = `https://t.me/${bot.options.username}?start=${userId}`;
  await ctx.answerCbQuery();
  ctx.reply(`🔗 Your Referral Link: ${referralLink}`);
});

// === Handle text messages (link detection + session) ===
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  const link = extractLink(text);

  try {
    // Session-based input
    if (ctx.session.awaitingLink && link) {
      ctx.session.awaitingLink = false;
      ctx.reply(
        `📎 Confirm you want to add this link?\n${link}`,
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ Confirm Add", `CONFIRM_ADD|${link}`)],
          [Markup.button.callback("❌ Cancel", "CANCEL")]
        ])
      );
      return;
    }

    if (ctx.session.awaitingCheck && link) {
      ctx.session.awaitingCheck = false;
      ctx.reply(
        `🔍 Confirm you want to check this link?\n${link}`,
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ Confirm Check", `CONFIRM_CHECK|${link}`)],
          [Markup.button.callback("❌ Cancel", "CANCEL")]
        ])
      );
      return;
    }

    if (ctx.session.awaitingReport && link) {
      ctx.session.awaitingReport = false;
      const reason = text.replace(link, "").trim() || "No reason";
      ctx.reply(
        `⚠️ Confirm you want to report this link?\n${link}\nReason: ${reason}`,
        Markup.inlineKeyboard([
          [Markup.button.callback(`✅ Confirm Report|${link}|${reason}`, `CONFIRM_REPORT|${link}|${reason}`)],
          [Markup.button.callback("❌ Cancel", "CANCEL")]
        ])
      );
      return;
    }

    // Auto-detect link
    if (link) {
      ctx.reply(
        `🔎 Detected a link: ${link}\nWhat would you like to do?`,
        Markup.inlineKeyboard([
          [Markup.button.callback("Add Link", `AUTO_ADD|${link}`)],
          [Markup.button.callback("Check Link", `AUTO_CHECK|${link}`)],
          [Markup.button.callback("Report Link", `AUTO_REPORT|${link}`)]
        ])
      );
    }
  } catch (err) {
    console.error("DB error on text handling:", err.message);
    ctx.reply("⚠️ Something went wrong. Try again later.");
    ctx.session.awaitingLink = ctx.session.awaitingCheck = ctx.session.awaitingReport = false;
  }
});

// === Confirmation Callbacks ===
bot.action(/CONFIRM_(ADD|CHECK|REPORT)\|?(.+)?/, async (ctx) => {
  await ctx.answerCbQuery();
  const action = ctx.match[1];
  const data = ctx.match[2];

  try {
    if (action === "ADD") {
      const link = data;
      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
      if (rows.length > 0) return ctx.reply("❌ This link already exists in Linktory.");
      const hiddenId = generateHiddenId();
      await pool.query(
        "INSERT INTO links (url, submitted_by, status, hidden_id) VALUES ($1, $2, 'pending', $3)",
        [link, ctx.from.id, hiddenId]
      );
      await pool.query("UPDATE users SET points = points + 10 WHERE telegram_id=$1", [ctx.from.id]);
      ctx.reply(`✅ Link added successfully!\nYour link ID: ${hiddenId}\n+10 points earned!`);
    } else if (action === "CHECK") {
      const link = data;
      const { rows } = await pool.query("SELECT * FROM links WHERE url=$1", [link]);
      if (rows.length === 0) return ctx.reply("❌ No record found. Add it with Add Link.");
      ctx.reply(`ℹ️ Link found:\nID: ${rows[0].hidden_id}\nStatus: ${rows[0].status}`);
    } else if (action === "REPORT") {
      const [link, reason] = data.split("|");
      let { rows } = await pool.query("SELECT id, hidden_id FROM links WHERE url=$1", [link]);
      let linkId;
      let hiddenId;
      if (rows.length === 0) {
        hiddenId = generateHiddenId();
        const res = await pool.query(
          "INSERT INTO links (url, submitted_by, status, hidden_id) VALUES ($1, $2, 'pending', $3) RETURNING id, hidden_id",
          [link, ctx.from.id, hiddenId]
        );
        linkId = res.rows[0].id;
      } else {
        linkId = rows[0].id;
        hiddenId = rows[0].hidden_id;
      }
      await pool.query(
        "INSERT INTO reports (link_id, reported_by, reason) VALUES ($1, $2, $3
