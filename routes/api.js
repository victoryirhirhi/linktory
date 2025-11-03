// routes/api.js
import express from "express";
import { pool } from "../config/db.js";
import { randomUUID } from "crypto";

const router = express.Router();

function hideShortCode(linkRow) {
  // Remove short_code before returning to public clients
  const { short_code, ...rest } = linkRow;
  return rest;
}

/**
 * POST /api/register
 */
router.post("/register", async (req, res) => {
  try {
    const { telegram_id, username } = req.body;
    if (!telegram_id) return res.status(400).json({ ok: false, message: "Missing telegram_id" });

    await pool.query(
      `INSERT INTO users (telegram_id, username, points, trust_score)
       VALUES ($1, $2, 0, 100)
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
 * Body: { url }
 * Returns exists true/false and link info if exists (short_code hidden)
 */
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

    // hide short_code (we didn't fetch it, but we intentionally omit)
    res.json({ ok: true, exists: true, link, reports, confirmations });
  } catch (e) {
    console.error("checkLink error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/addLink
 * Body: { url, telegram_id }
 * Adds link if not exists. Awards 5 points to submitter.
 * NOTE: short_code is generated and stored, but NOT returned to user.
 */
router.post("/addLink", async (req, res) => {
  try {
    const { url, telegram_id } = req.body;
    if (!url) return res.status(400).json({ ok: false, message: "Missing url" });

    const exists = await pool.query("SELECT id, url, status, created_at FROM links WHERE url=$1", [url]);
    if (exists.rowCount > 0) {
      return res.json({ ok: true, added: false, message: "Already exists", link: exists.rows[0] });
    }

    // generate 6-hex style code: use randomUUID and take first 6 hex chars
    const shortCode = randomUUID().replace(/-/g, "").slice(0, 6);

    const insert = await pool.query(
      `INSERT INTO links (url, status, short_code, submitted_by, created_at)
       VALUES ($1, 'pending', $2, $3, now())
       RETURNING id, url, status, created_at`,
      [url, shortCode, telegram_id || null]
    );

    // award points (5)
    if (telegram_id) {
      await pool.query(
        "INSERT INTO users (telegram_id, username, points, trust_score) VALUES ($1, NULL, 0, 100) ON CONFLICT (telegram_id) DO NOTHING",
        [telegram_id]
      );
      await pool.query("UPDATE users SET points = points + 5 WHERE telegram_id=$1", [telegram_id]);
    }

    const out = insert.rows[0]; // intentionally DOES NOT include short_code
    res.json({ ok: true, added: true, link: out });
  } catch (e) {
    console.error("addLink error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/report
 * Body: { url, reason, telegram_id }
 * Creates report row and link if missing. Awards 5 points to reporter.
 */
router.post("/report", async (req, res) => {
  try {
    const { url, reason, telegram_id } = req.body;
    if (!url) return res.status(400).json({ ok: false, message: "Missing url" });

    let linkRow = (await pool.query("SELECT id FROM links WHERE url=$1", [url])).rows[0];
    if (!linkRow) {
      const shortCode = randomUUID().replace(/-/g, "").slice(0, 6);
      const ins = await pool.query(
        "INSERT INTO links (url, status, short_code, submitted_by, created_at) VALUES ($1,'pending',$2,$3,now()) RETURNING id",
        [url, shortCode, telegram_id || null]
      );
      linkRow = ins.rows[0];
    }

    await pool.query(
      "INSERT INTO reports (link_id, reason, reported_by, created_at) VALUES ($1,$2,$3,now())",
      [linkRow.id, reason || null, telegram_id || null]
    );

    // award reporter points (5)
    if (telegram_id) {
      await pool.query(
        "INSERT INTO users (telegram_id, username, points, trust_score) VALUES ($1, NULL, 0, 100) ON CONFLICT (telegram_id) DO NOTHING",
        [telegram_id]
      );
      await pool.query("UPDATE users SET points = points + 5 WHERE telegram_id=$1", [telegram_id]);
    }

    res.json({ ok: true, message: "Report submitted" });
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
    const r = await pool.query("SELECT username, telegram_id, points, trust_score FROM users ORDER BY points DESC LIMIT 20");
    res.json({ ok: true, rows: r.rows });
  } catch (e) {
    console.error("leaderboard error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/profile/:id
 * Returns user + their links (short_code hidden in link list)
 */
router.get("/profile/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const r = await pool.query("SELECT telegram_id, username, points, trust_score, created_at FROM users WHERE telegram_id=$1", [id]);
    if (r.rowCount === 0) return res.json({ ok: false, message: "No user" });

    const links = (await pool.query(
      "SELECT id, url, status, created_at FROM links WHERE submitted_by=$1 ORDER BY created_at DESC LIMIT 20",
      [id]
    )).rows;

    res.json({ ok: true, user: r.rows[0], links });
  } catch (e) {
    console.error("profile error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

export default router;
