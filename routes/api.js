import express from "express";
import { pool } from "../config/db.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

const router = express.Router();

/**
 * Helper: verify Telegram initData string.
 * Accepts the raw initData string (e.g. window.Telegram.WebApp.initData).
 * Returns true if HMAC matches.
 */
function verifyTelegramInitData(initDataString) {
  try {
    if (!initDataString || typeof initDataString !== "string") return false;

    // Parse query-string style input into key->value
    const params = new URLSearchParams(initDataString);
    const hash = params.get("hash");
    if (!hash) return false;

    // Build data_check_string: sort keys (except hash) lexicographically
    const dataPairs = [];
    for (const [k, v] of params.entries()) {
      if (k === "hash") continue;
      // Use the raw value (decoded)
      dataPairs.push([k, v]);
    }
    dataPairs.sort((a, b) => a[0].localeCompare(b[0]));
    const dataCheckString = dataPairs.map(([k, v]) => `${k}=${v}`).join("\n");

    // Secret key: SHA256(bot_token) as raw bytes
    const secretKey = crypto.createHash("sha256").update(process.env.BOT_TOKEN || "").digest();
    const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    return hmac === hash;
  } catch (e) {
    console.error("verifyTelegramInitData error:", e);
    return false;
  }
}

// JWT cookie name
const SESSION_COOKIE_NAME = "linktory_session";

// Create JWT and set cookie
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

// Auth middleware: attach req.user if cookie present
function authMiddleware(req, res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) return next();
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload && payload.telegram_id) {
      req.user = { telegram_id: payload.telegram_id };
    }
  } catch (e) {
    // ignore invalid token
    req.user = null;
  }
  return next();
}

/* -------------------------
   Public routes (no cookie needed)
   ------------------------- */

// POST /api/authInit
// Body: { initData }  (the string from window.Telegram.WebApp.initData)
router.post("/authInit", async (req, res) => {
  try {
    const { initData } = req.body;
    if (!initData) return res.status(400).json({ ok: false, message: "Missing initData" });

    const valid = verifyTelegramInitData(initData);
    if (!valid) return res.status(401).json({ ok: false, message: "Invalid initData" });

    // Parse user info from initData (user may be JSON-encoded)
    const params = new URLSearchParams(initData);
    let telegram_id = null;
    let username = null;

    // Telegram sometimes sends 'user' param as JSON encoded
    const userParam = params.get("user");
    if (userParam) {
      try {
        const userObj = JSON.parse(userParam);
        telegram_id = userObj.id;
        username = userObj.username || `${userObj.first_name || ""}${userObj.last_name ? " " + userObj.last_name : ""}`.trim();
      } catch (e) {
        // ignore
      }
    }

    // fallback to other params if present
    if (!telegram_id) {
      telegram_id = params.get("id") || null;
    }
    if (!username) {
      username = params.get("username") || null;
    }

    if (!telegram_id) {
      return res.status(400).json({ ok: false, message: "No user id found in initData" });
    }

    // Upsert user row
    await pool.query(
      `INSERT INTO users (telegram_id, username, points, trust_score, created_at)
       VALUES ($1, $2, 0, 100, now())
       ON CONFLICT (telegram_id) DO UPDATE SET username = EXCLUDED.username`,
      [telegram_id, username || null]
    );

    // create session cookie
    createSessionCookie(res, { telegram_id });

    return res.json({ ok: true, telegram_id, username: username || null });
  } catch (e) {
    console.error("authInit error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// POST /api/register (keeps prior behavior)
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

/* -------------------------
   Protected routes (use authMiddleware)
   ------------------------- */
router.use(authMiddleware);

// Helpers
function hideShortCode(linkRow) {
  const { short_code, ...rest } = linkRow;
  return rest;
}

// POST /api/checkLink
router.post("/checkLink", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ ok: false, message: "Missing url" });

    const r = await pool.query(
      "SELECT id, url, status, submitted_by, created_at FROM links WHERE url = $1",
      [url]
    );

    if (r.rowCount === 0) return res.json({ ok: true, exists: false });

    const link = r.rows[0];

    const reports = (
      await pool.query(
        "SELECT id, reason, reported_by, created_at FROM reports WHERE link_id=$1 ORDER BY created_at DESC",
        [link.id]
      )
    ).rows;

    const confirmations = (
      await pool.query(
        "SELECT id, user_id, confirmation, created_at FROM confirmations WHERE link_id=$1 ORDER BY created_at DESC",
        [link.id]
      )
    ).rows;

    return res.json({ ok: true, exists: true, link, reports, confirmations });
  } catch (e) {
    console.error("checkLink error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// GET /api/recent
router.get("/recent", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, url, status, created_at
       FROM links
       ORDER BY created_at DESC
       LIMIT 10`
    );
    return res.json({ ok: true, rows: result.rows });
  } catch (err) {
    console.error("recent error:", err);
    return res.json({ ok: false, error: "Failed to load recent links" });
  }
});

// POST /api/addLink
// Body: { url, telegram_id (optional) }
// Prefer req.user.telegram_id (from cookie)
router.post("/addLink", async (req, res) => {
  try {
    const { url } = req.body;
    const telegram_id = (req.user && req.user.telegram_id) || req.body.telegram_id;

    if (!url) return res.status(400).json({ ok: false, message: "Missing url" });
    if (!telegram_id) return res.status(401).json({ ok: false, message: "Authentication required. Open app from Telegram." });

    await pool.query(
      `INSERT INTO users (telegram_id, username, points, trust_score, created_at)
       VALUES ($1, NULL, 0, 100, now())
       ON CONFLICT (telegram_id) DO NOTHING`,
      [telegram_id]
    );

    const exists = await pool.query("SELECT id, url, status, created_at FROM links WHERE url=$1", [url]);
    if (exists.rowCount > 0) {
      return res.json({ ok: true, added: false, message: "Already exists", link: exists.rows[0] });
    }

    const shortCode = randomUUID().replace(/-/g, "").slice(0, 6);

    const insert = await pool.query(
      `INSERT INTO links (url, status, short_code, submitted_by, created_at)
       VALUES ($1, 'pending', $2, $3, now())
       RETURNING id, url, status, created_at`,
      [url, shortCode, telegram_id]
    );

    await pool.query("UPDATE users SET points = points + 5 WHERE telegram_id=$1", [telegram_id]);

    const out = insert.rows[0];
    return res.json({ ok: true, added: true, link: out });
  } catch (e) {
    console.error("addLink error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// POST /api/report
router.post("/report", async (req, res) => {
  try {
    const { url, reason } = req.body;
    const telegram_id = (req.user && req.user.telegram_id) || req.body.telegram_id;

    if (!url) return res.status(400).json({ ok: false, message: "Missing url" });
    if (!telegram_id) return res.status(401).json({ ok: false, message: "Authentication required. Open app from Telegram." });

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

// GET /api/leaderboard
router.get("/leaderboard", async (req, res) => {
  try {
    const r = await pool.query("SELECT username, telegram_id, points, trust_score FROM users ORDER BY points DESC LIMIT 20");
    return res.json({ ok: true, rows: r.rows });
  } catch (e) {
    console.error("leaderboard error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// GET /api/profile/:id
router.get("/profile/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const r = await pool.query("SELECT telegram_id, username, points, trust_score, created_at FROM users WHERE telegram_id=$1", [id]);
    if (r.rowCount === 0) return res.json({ ok: false, message: "No user" });

    const links = (await pool.query(
      "SELECT id, url, status, created_at FROM links WHERE submitted_by=$1 ORDER BY created_at DESC LIMIT 20",
      [id]
    )).rows;

    return res.json({ ok: true, user: r.rows[0], links });
  } catch (e) {
    console.error("profile error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

export default router;
