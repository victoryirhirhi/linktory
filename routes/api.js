import express from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { pool } from "../config/db.js";

const router = express.Router();
const SESSION_COOKIE_NAME = "linktory_session";

// ---------------------------
// Telegram Signature Verification
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

    const secretKey = crypto
      .createHash("sha256")
      .update(process.env.BOT_TOKEN || "")
      .digest();

    const hmac = crypto.createHmac("sha256", secretKey);
    hmac.update(dataCheckString);
    const computedHash = hmac.digest("hex");

    return computedHash === hash;
  } catch (e) {
    console.error("verifyTelegramInitData error:", e);
    return false;
  }
}

// ---------------------------
// Session Cookie
// ---------------------------
function createSessionCookie(res, payload) {
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });
  const secure = process.env.NODE_ENV === "production";
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

// ---------------------------
// Auth Middleware
// ---------------------------
function authMiddleware(req, res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) return next();
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload && payload.telegram_id)
      req.user = { telegram_id: payload.telegram_id };
  } catch {
    req.user = null;
  }
  next();
}

// ---------------------------
// Public routes
// ---------------------------
router.get("/recent", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT id, url, status, created_at FROM links ORDER BY created_at DESC LIMIT 10"
    );
    res.json({ ok: true, rows: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: "Failed to load recent links" });
  }
});

router.get("/leaderboard", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT username, telegram_id, points FROM users ORDER BY points DESC LIMIT 20"
    );
    res.json({ ok: true, rows: r.rows });
  } catch {
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ---------------------------
// Protected routes
// ---------------------------
router.use(authMiddleware);

router.post("/addLink", async (req, res) => {
  try {
    const { url, telegram_id } = req.body;
    if (!url || !telegram_id)
      return res.status(400).json({ ok: false, message: "Missing data" });

    const exists = await pool.query("SELECT * FROM links WHERE url=$1", [url]);
    if (exists.rowCount > 0)
      return res.json({ ok: true, added: false, message: "Already exists" });

    const shortCode = randomUUID().slice(0, 6);
    const insert = await pool.query(
      "INSERT INTO links (url, status, short_code, submitted_by, created_at) VALUES ($1, 'pending', $2, $3, now()) RETURNING *",
      [url, shortCode, telegram_id]
    );

    await pool.query("UPDATE users SET points = points + 5 WHERE telegram_id=$1", [
      telegram_id,
    ]);

    res.json({ ok: true, added: true, link: insert.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

router.post("/report", async (req, res) => {
  try {
    const { url, reason, telegram_id } = req.body;
    if (!url || !telegram_id)
      return res.status(400).json({ ok: false, message: "Missing data" });

    let linkRow = (await pool.query("SELECT id FROM links WHERE url=$1", [url]))
      .rows[0];

    if (!linkRow) {
      const shortCode = randomUUID().slice(0, 6);
      const ins = await pool.query(
        "INSERT INTO links (url, status, short_code, submitted_by, created_at) VALUES ($1, 'pending', $2, $3, now()) RETURNING id",
        [url, shortCode, telegram_id]
      );
      linkRow = ins.rows[0];
    }

    await pool.query(
      "INSERT INTO reports (link_id, reason, reported_by, created_at) VALUES ($1, $2, $3, now())",
      [linkRow.id, reason, telegram_id]
    );

    await pool.query("UPDATE users SET points = points + 5 WHERE telegram_id=$1", [
      telegram_id,
    ]);

    res.json({ ok: true, message: "Report submitted" });
  } catch {
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

router.get("/profile/:id", async (req, res) => {
  try {
    const telegram_id = req.params.id;
    const userRes = await pool.query(
      "SELECT username, points, is_moderator, moderator_request FROM users WHERE telegram_id=$1",
      [telegram_id]
    );
    if (userRes.rowCount === 0)
      return res.json({ ok: false, message: "User not found" });

    const user = userRes.rows[0];
    const linksRes = await pool.query(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) AS verified FROM links WHERE submitted_by=$1",
      [telegram_id]
    );
    const recentRes = await pool.query(
      "SELECT url, status FROM links WHERE submitted_by=$1 ORDER BY created_at DESC LIMIT 10",
      [telegram_id]
    );

    res.json({
      ok: true,
      user: {
        ...user,
        total_links: parseInt(linksRes.rows[0].total) || 0,
        verified_links: parseInt(linksRes.rows[0].verified) || 0,
        recent_links: recentRes.rows,
      },
    });
  } catch {
    res.status(500).json({ ok: false, message: "Failed to load profile" });
  }
});

router.post("/upgradeModerator", async (req, res) => {
  try {
    const { telegram_id } = req.body;
    await pool.query(
      "UPDATE users SET is_moderator=TRUE WHERE telegram_id=$1",
      [telegram_id]
    );
    res.json({ ok: true, message: "Upgraded to moderator" });
  } catch {
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

export default router;
