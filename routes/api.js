import express from "express";
import { pool } from "../config/db.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

const router = express.Router();

// ---------------------------
// Telegram initData verification
// ---------------------------
function verifyTelegramInitData(initDataString) {
  try {
    if (!initDataString || typeof initDataString !== "string") return false;
    const params = new URLSearchParams(initDataString);
    const hash = params.get("hash");
    if (!hash) return false;

    const dataPairs = [];
    for (const [k, v] of params.entries()) {
      if (k === "hash") continue;
      dataPairs.push([k, v]);
    }
    dataPairs.sort((a, b) => a[0].localeCompare(b[0]));
    const dataCheckString = dataPairs.map(([k, v]) => `${k}=${v}`).join("\n");
    const secretKey = crypto.createHash("sha256").update(process.env.BOT_TOKEN || "").digest();
    const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    return hmac === hash;
  } catch (e) {
    console.error("verifyTelegramInitData error:", e);
    return false;
  }
}

// ---------------------------
// Session JWT cookie
// ---------------------------
const SESSION_COOKIE_NAME = "linktory_session";

function createSessionCookie(res, payload) {
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });
  const secure = process.env.NODE_ENV === "production";
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

// ---------------------------
// Auth middleware
// ---------------------------
function authMiddleware(req, res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) return next();
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload && payload.telegram_id) req.user = { telegram_id: payload.telegram_id };
  } catch (e) {
    req.user = null;
  }
  return next();
}

// ---------------------------
// Public routes
// ---------------------------
router.post("/authInit", async (req, res) => {
  try {
    const { initData } = req.body;
    if (!initData) return res.status(400).json({ ok: false, message: "Missing initData" });
    if (!verifyTelegramInitData(initData)) return res.status(401).json({ ok: false, message: "Invalid initData" });

    const params = new URLSearchParams(initData);
    let telegram_id = null;
    let username = null;

    const userParam = params.get("user");
    if (userParam) {
      try {
        const userObj = JSON.parse(userParam);
        telegram_id = userObj.id;
        username = userObj.username || `${userObj.first_name || ""}${userObj.last_name ? " " + userObj.last_name : ""}`.trim();
      } catch {}
    }

    if (!telegram_id) telegram_id = params.get("id");
    if (!username) username = params.get("username");
    if (!telegram_id) return res.status(400).json({ ok: false, message: "No user id found in initData" });

    await pool.query(
      `INSERT INTO users (telegram_id, username, points, trust_score, created_at)
       VALUES ($1, $2, 0, 100, now())
       ON CONFLICT (telegram_id) DO UPDATE SET username = EXCLUDED.username`,
      [telegram_id, username || null]
    );

    createSessionCookie(res, { telegram_id });
    return res.json({ ok: true, telegram_id, username: username || null });
  } catch (e) {
    console.error("authInit error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { telegram_id, username } = req.body;
    if (!telegram_id) return res.status(400).json({ ok: false, message: "Missing telegram_id" });

    await pool.query(
      `INSERT INTO users (telegram_id, username, points, trust_score, created_at)
       VALUES ($1, $2, 0, 100, now())
       ON CONFLICT (telegram_id) DO UPDATE SET username = EXCLUDED.username`,
      [telegram_id, username || null]
    );

    const r = await pool.query(
      "SELECT telegram_id, username, points, trust_score FROM users WHERE telegram_id=$1",
      [telegram_id]
    );
    return res.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    console.error("register error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

router.get("/recent", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT id, url, status, created_at FROM links ORDER BY created_at DESC LIMIT 10"
    );
    return res.json({ ok: true, rows: r.rows });
  } catch (e) {
    console.error("recent error:", e);
    return res.status(500).json({ ok: false, message: "Failed to load recent links" });
  }
});

// ---------------------------
// Protected routes
// ---------------------------
router.use(authMiddleware);

router.post("/addLink", async (req, res) => {
  try {
    const { url } = req.body;
    const telegram_id = (req.user && req.user.telegram_id) || req.body.telegram_id;
    if (!url) return res.status(400).json({ ok: false, message: "Missing url" });
    if (!telegram_id) return res.status(401).json({ ok: false, message: "Open the app from Telegram" });

    await pool.query(
      `INSERT INTO users (telegram_id, username, points, trust_score, created_at)
       VALUES ($1, NULL, 0, 100, now())
       ON CONFLICT (telegram_id) DO NOTHING`,
      [telegram_id]
    );

    const exists = await pool.query("SELECT id, url, status, created_at FROM links WHERE url=$1", [url]);
    if (exists.rowCount > 0) return res.json({ ok: true, added: false, message: "Already exists", link: exists.rows[0] });

    const shortCode = randomUUID().replace(/-/g, "").slice(0, 6);
    const insert = await pool.query(
      `INSERT INTO links (url, status, short_code, submitted_by, created_at)
       VALUES ($1, 'pending', $2, $3, now())
       RETURNING id, url, status, created_at`,
      [url, shortCode, telegram_id]
    );

    await pool.query("UPDATE users SET points = points + 5 WHERE telegram_id=$1", [telegram_id]);
    return res.json({ ok: true, added: true, link: insert.rows[0] });
  } catch (e) {
    console.error("addLink error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

router.post("/report", async (req, res) => {
  try {
    const { url, reason } = req.body;
    const telegram_id = (req.user && req.user.telegram_id) || req.body.telegram_id;
    if (!url) return res.status(400).json({ ok: false, message: "Missing url" });
    if (!telegram_id) return res.status(401).json({ ok: false, message: "Open the app from Telegram" });

    await pool.query(
      `INSERT INTO users (telegram_id, username, points, trust_score, created_at)
       VALUES ($1, NULL, 0, 100, now())
       ON CONFLICT (telegram_id) DO NOTHING`,
      [telegram_id]
    );

    let linkRow = (await pool.query("SELECT id FROM links WHERE url=$1", [url])).rows[0];
    if (!linkRow) {
      const shortCode = randomUUID().replace(/-/g, "").slice(0, 6);
      const ins = await pool.query(
        "INSERT INTO links (url, status, short_code, submitted_by, created_at) VALUES ($1,'pending',$2,$3,now()) RETURNING id",
        [url, shortCode, telegram_id]
      );
      linkRow = ins.rows[0];
    }

    await pool.query(
      "INSERT INTO reports (link_id, reason, reported_by, created_at) VALUES ($1,$2,$3,now())",
      [linkRow.id, reason || null, telegram_id]
    );

    await pool.query("UPDATE users SET points = points + 5 WHERE telegram_id=$1", [telegram_id]);
    return res.json({ ok: true, message: "Report submitted" });
  } catch (e) {
    console.error("report error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

router.get("/leaderboard", async (req, res) => {
  try {
    const r = await pool.query("SELECT username, telegram_id, points, trust_score FROM users ORDER BY points DESC LIMIT 20");
    return res.json({ ok: true, rows: r.rows });
  } catch (e) {
    console.error("leaderboard error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ---------------------------
// Profile route
// ---------------------------
router.get("/profile/:id", async (req, res) => {
  try {
    const telegram_id = req.params.id;
    if (!telegram_id) return res.status(400).json({ ok: false, message: "Missing telegram_id" });

    const userRes = await pool.query(
      "SELECT username, points, trust_score, COALESCE(is_moderator,FALSE) AS is_moderator, COALESCE(moderator_request,FALSE) AS moderator_request FROM users WHERE telegram_id=$1",
      [telegram_id]
    );
    if (userRes.rowCount === 0) return res.json({ ok: false, message: "User not found" });
    const user = userRes.rows[0];

    const linksRes = await pool.query(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) AS verified FROM links WHERE submitted_by=$1",
      [telegram_id]
    );

    const total_links = parseInt(linksRes.rows[0].total) || 0;
    const verified_links = parseInt(linksRes.rows[0].verified) || 0;

    const recentLinksRes = await pool.query(
      "SELECT id, url, status, created_at FROM links WHERE submitted_by=$1 ORDER BY created_at DESC LIMIT 10",
      [telegram_id]
    );

    return res.json({
      ok: true,
      user: {
        username: user.username,
        points: user.points,
        trust_score: user.trust_score,
        is_moderator: user.is_moderator,
        moderator_request: user.moderator_request,
        total_links,
        verified_links,
        recent_links: recentLinksRes.rows
      }
    });
  } catch (e) {
    console.error("profile error:", e);
    return res.status(500).json({ ok: false, message: "Failed to load profile" });
  }
});

// ---------------------------
// Upgrade to Moderator
// ---------------------------
router.post("/upgradeModerator", async (req, res) => {
  try {
    const { telegram_id } = req.body;
    if (!telegram_id) return res.status(400).json({ ok: false, message: "Missing telegram_id" });

    const userRes = await pool.query(
      "SELECT is_moderator FROM users WHERE telegram_id=$1",
      [telegram_id]
    );
    if (userRes.rowCount === 0) return res.json({ ok: false, message: "User not found" });
    if (userRes.rows[0].is_moderator) return res.json({ ok: false, message: "Already a moderator" });

    await pool.query("UPDATE users SET is_moderator=TRUE, moderator_request=FALSE WHERE telegram_id=$1", [telegram_id]);
    return res.json({ ok: true, message: "Successfully upgraded to moderator" });
  } catch (e) {
    console.error("upgradeModerator error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

export default router;
