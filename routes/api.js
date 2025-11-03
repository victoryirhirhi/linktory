// routes/api.js
import express from "express";
import pool from "../config/db.js";
import { randomUUID } from "crypto";

const router = express.Router();

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
    console.error("register error:", e.message);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/checkLink
 */
router.post("/checkLink", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ ok: false, message: "Missing url" });

    const linkRow = await pool.query(
      "SELECT id, url, status, short_code FROM links WHERE url=$1",
      [url]
    );

    if (linkRow.rowCount === 0) return res.json({ ok: true, exists: false });

    const link = linkRow.rows[0];

    const reports = (
      await pool.query(
        "SELECT reason, reported_by, created_at FROM reports WHERE link_id=$1 ORDER BY created_at DESC",
        [link.id]
      )
    ).rows;

    const confirmations = (
      await pool.query(
        "SELECT confirmation, user_id, created_at FROM confirmations WHERE link_id=$1 ORDER BY created_at DESC",
        [link.id]
      )
    ).rows;

    res.json({ ok: true, exists: true, link, reports, confirmations });
  } catch (e) {
    console.error("checkLink error:", e.message);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/addLink
 */
router.post("/addLink", async (req, res) => {
  try {
    const { url, telegram_id } = req.body;
    if (!url) return res.status(400).json({ ok: false, message: "Missing url" });

    const exists = await pool.query(
      "SELECT id, url, status, short_code FROM links WHERE url=$1",
      [url]
    );

    if (exists.rowCount > 0) {
      return res.json({ ok: true, added: false, message: "Already exists", link: exists.rows[0] });
    }

    const shortCode = randomUUID().slice(0, 8);

    const insert = await pool.query(
      "INSERT INTO links (url, status, short_code, submitted_by) VALUES ($1,'pending',$2,$3) RETURNING id, url, status, short_code",
      [url, shortCode, telegram_id || null]
    );

    if (telegram_id) {
      await pool.query(
        "INSERT INTO users (telegram_id, points, trust_score) VALUES ($1,0,100) ON CONFLICT (telegram_id) DO NOTHING",
        [telegram_id]
      );

      await pool.query("UPDATE users SET points = points + 5 WHERE telegram_id=$1", [telegram_id]);
    }

    res.json({ ok: true, added: true, link: insert.rows[0] });
  } catch (e) {
    console.error("addLink error:", e.message);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/report
 */
router.post("/report", async (req, res) => {
  try {
    const { url, reason, telegram_id } = req.body;
    if (!url) return res.status(400).json({ ok: false, message: "Missing url" });

    let link = (
      await pool.query("SELECT id FROM links WHERE url=$1", [url])
    ).rows[0];

    if (!link) {
      const shortCode = randomUUID().slice(0, 8);
      link = (
        await pool.query(
          "INSERT INTO links (url, status, short_code, submitted_by) VALUES ($1,'pending',$2,$3) RETURNING id",
          [url, shortCode, telegram_id || null]
        )
      ).rows[0];
    }

    await pool.query(
      "INSERT INTO reports (link_id, reason, reported_by) VALUES ($1,$2,$3)",
      [link.id, reason || null, telegram_id || null]
    );

    if (telegram_id) {
      await pool.query(
        "INSERT INTO users (telegram_id, points, trust_score) VALUES ($1,0,100) ON CONFLICT (telegram_id) DO NOTHING",
        [telegram_id]
      );

      await pool.query("UPDATE users SET points = points + 5 WHERE telegram_id=$1", [telegram_id]);
    }

    res.json({ ok: true, message: "Report submitted" });
  } catch (e) {
    console.error("report error:", e.message);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/leaderboard
 */
router.get("/leaderboard", async (req, res) => {
  try {
    const rows = (
      await pool.query(
        "SELECT username, telegram_id, points, trust_score FROM users ORDER BY points DESC LIMIT 20"
      )
    ).rows;

    res.json({ ok: true, rows });
  } catch (e) {
    console.error("leaderboard error:", e.message);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/profile/:id
 */
router.get("/profile/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const user = (
      await pool.query("SELECT username, telegram_id, points, trust_score FROM users WHERE telegram_id=$1", [id])
    ).rows[0];

    if (!user) return res.json({ ok: false, message: "No user found" });

    const links = (
      await pool.query(
        "SELECT id, url, status, short_code FROM links WHERE submitted_by=$1 ORDER BY id DESC LIMIT 20",
        [id]
      )
    ).rows;

    res.json({ ok: true, user, links });
  } catch (e) {
    console.error("profile error:", e.message);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

export default router;
