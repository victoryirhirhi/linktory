import express from "express";
import { pool } from "../config/db.js";
import { randomUUID } from "crypto";

const router = express.Router();

function hideShortCode(linkRow) {
  const { short_code, ...rest } = linkRow;
  return rest;
}

// POST /api/register
// Body: { telegram_id, username }
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

// POST /api/checkLink
// Body: { url }
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
// Body: { url, telegram_id }
router.post("/addLink", async (req, res) => {
  try {
    const { url, telegram_id } = req.body;
    if (!url) return res.status(400).json({ ok: false, message: "Missing url" });

    // enforce authenticated user
    if (!telegram_id) {
      return res.status(401).json({ ok: false, message: "Authentication required. Open app from Telegram." });
    }

    // ensure user exists
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

    // submitted_by must be NOT NULL in DB so pass telegram_id
    const insert = await pool.query(
      `INSERT INTO links (url, status, short_code, submitted_by, created_at)
       VALUES ($1, 'pending', $2, $3, now())
       RETURNING id, url, status, created_at`,
      [url, shortCode, telegram_id]
    );

    // award points
    await pool.query("UPDATE users SET points = points + 5 WHERE telegram_id=$1", [telegram_id]);

    const out = insert.rows[0];
    return res.json({ ok: true, added: true, link: out });
  } catch (e) {
    console.error("addLink error:", e);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// POST /api/report
// Body: { url, reason, telegram_id }
router.post("/report", async (req, res) => {
  try {
    const { url, reason, telegram_id } = req.body;
    if (!url) return res.status(400).json({ ok: false, message: "Missing url" });

    if (!telegram_id) {
      return res.status(401).json({ ok: false, message: "Authentication required. Open app from Telegram." });
    }

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
