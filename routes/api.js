import express from "express";
import { pool } from "../config/db.js"; // ✅ fixed import

const router = express.Router();

/**
 * POST /api/register
 * Creates user if missing
 */
router.post("/register", async (req, res) => {
  try {
    const { telegram_id, username } = req.body;
    if (!telegram_id) return res.status(400).json({ ok: false, message: "Missing telegram_id" });

    await pool.query(
      `INSERT INTO users (telegram_id, username, points, trust_score, created_at)
       VALUES ($1, $2, 0, 100, now())
       ON CONFLICT (telegram_id) DO NOTHING`,
      [telegram_id, username || null]
    );

    const r = await pool.query(
      "SELECT telegram_id, username, points, trust_score FROM users WHERE telegram_id=$1",
      [telegram_id]
    );
    res.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    console.error("register error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/checkLink
 * Check if link exists
 */
router.post("/checkLink", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ ok: false, message: "Missing url" });

    const linkResult = await pool.query(
      "SELECT id, url, status, hidden_id, submitted_by, created_at FROM links WHERE url=$1",
      [url]
    );

    if (linkResult.rowCount === 0) return res.json({ ok: true, exists: false });

    const link = linkResult.rows[0];

    const reports = (
      await pool.query(
        "SELECT id, reason, reported_by, created_at FROM reports WHERE url=$1 ORDER BY created_at DESC",
        [url]
      )
    ).rows;

    const confirmations = (
      await pool.query(
        "SELECT id, user_id, confirmation, created_at FROM confirmations WHERE link_id=$1 ORDER BY created_at DESC",
        [link.id]
      )
    ).rows;

    res.json({ ok: true, exists: true, link, reports, confirmations });
  } catch (e) {
    console.error("checkLink error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/addLink
 * Adds link + awards 5 points
 */
router.post("/addLink", async (req, res) => {
  try {
    const { url, telegram_id } = req.body;
    if (!url) return res.status(400).json({ ok: false, message: "Missing url" });

    const exists = await pool.query("SELECT id, status, hidden_id FROM links WHERE url=$1", [url]);
    if (exists.rowCount > 0) {
      return res.json({ ok: true, added: false, message: "Already exists", link: exists.rows[0] });
    }

    const hiddenId = crypto.randomBytes(4).toString("hex");

    const insert = await pool.query(
      `INSERT INTO links (url, status, added_by, submitted_by, hidden_id, created_at)
       VALUES ($1,'pending',$2,$2,$3,now())
       RETURNING id, url, status, hidden_id, created_at`,
      [url, telegram_id || null, hiddenId]
    );

    if (telegram_id) {
      await pool.query(
        "INSERT INTO users (telegram_id, username, points, trust_score, created_at) VALUES ($1,NULL,0,100,now()) ON CONFLICT (telegram_id) DO NOTHING",
        [telegram_id]
      );
      await pool.query("UPDATE users SET points = points + 5 WHERE telegram_id=$1", [telegram_id]);
    }

    res.json({ ok: true, added: true, link: insert.rows[0] });
  } catch (e) {
    console.error("addLink error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/report
 * Report link + awards 5 points
 */
router.post("/report", async (req, res) => {
  try {
    const { url, reason, telegram_id } = req.body;
    if (!url) return res.status(400).json({ ok: false, message: "Missing url" });

    let link = (await pool.query("SELECT id FROM links WHERE url=$1", [url])).rows[0];

    if (!link) {
      const hiddenId = crypto.randomBytes(4).toString("hex");
      const result = await pool.query(
        "INSERT INTO links (url, status, added_by, submitted_by, hidden_id, created_at) VALUES ($1,'pending',$2,$2,$3,now()) RETURNING id",
        [url, telegram_id || null, hiddenId]
      );
      link = result.rows[0];
    }

    await pool.query(
      "INSERT INTO reports (url, link_id, reason, reported_by, created_at) VALUES ($1,$2,$3,$4,now())",
      [url, link.id, reason || null, telegram_id || null]
    );

    if (telegram_id) {
      await pool.query(
        "INSERT INTO users (telegram_id, username, points, trust_score, created_at) VALUES ($1,NULL,0,100,now()) ON CONFLICT (telegram_id) DO NOTHING",
        [telegram_id]
      );
      await pool.query("UPDATE users SET points = points + 5 WHERE telegram_id=$1", [telegram_id]);
    }

    res.json({ ok: true, message: "Reported successfully" });
  } catch (e) {
    console.error("report error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/leaderboard
 */
router.get("/leaderboard", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT username, telegram_id, points, trust_score FROM users ORDER BY points DESC LIMIT 20"
    );
    res.json({ ok: true, rows: result.rows });
  } catch (e) {
    console.error("leaderboard error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/profile/:id
 */
router.get("/profile/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT telegram_id, username, points, trust_score, created_at FROM users WHERE telegram_id=$1",
      [req.params.id]
    );

    if (result.rowCount === 0) return res.json({ ok: false, message: "User not found" });

    const links = (
      await pool.query(
        "SELECT id, url, status, hidden_id, created_at FROM links WHERE submitted_by=$1 ORDER BY created_at DESC LIMIT 20",
        [req.params.id]
      )
    ).rows;

    res.json({ ok: true, user: result.rows[0], links });
  } catch (e) {
    console.error("profile error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

export default router;
