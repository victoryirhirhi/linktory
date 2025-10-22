// routes/api.js
import express from "express";
import pool from "../config/db.js";

const router = express.Router();

// Add link
router.post("/addLink", async (req, res) => {
  try {
    const { url, telegram_id } = req.body;
    if (!url) return res.status(400).json({ ok: false, message: "Missing URL" });

    const exists = await pool.query("SELECT id FROM links WHERE url=$1", [url]);
    if (exists.rowCount > 0) {
      return res.json({ ok: true, message: "Already exists" });
    }

    await pool.query(
      "INSERT INTO links (url, status, added_by, created_at) VALUES ($1,'pending',$2,now())",
      [url, telegram_id || null]
    );
    res.json({ ok: true, message: "Link added successfully!" });
  } catch (e) {
    console.error("addLink error:", e.message);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

// Check link
router.post("/checkLink", async (req, res) => {
  const { url } = req.body;
  const r = await pool.query("SELECT * FROM links WHERE url=$1", [url]);
  if (r.rowCount === 0) return res.json({ ok: true, exists: false });
  res.json({ ok: true, exists: true, link: r.rows[0] });
});

// Report link
router.post("/report", async (req, res) => {
  const { url, reason, telegram_id } = req.body;
  await pool.query(
    "INSERT INTO reports (url, reason, reported_by, created_at) VALUES ($1,$2,$3,now())",
    [url, reason, telegram_id || null]
  );
  res.json({ ok: true, message: "Reported!" });
});

// Leaderboard
router.get("/leaderboard", async (req, res) => {
  const r = await pool.query("SELECT username, points FROM users ORDER BY points DESC LIMIT 20");
  res.json({ ok: true, rows: r.rows });
});

// Profile
router.get("/profile/:id", async (req, res) => {
  const r = await pool.query("SELECT * FROM users WHERE telegram_id=$1", [req.params.id]);
  if (r.rowCount === 0) return res.json({ ok: false });
  res.json({ ok: true, user: r.rows[0] });
});

export default router;
