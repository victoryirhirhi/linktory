// dashboard/index.js
export function setupDashboard(app, pool) {
    // Basic HTML dashboard
    app.get("/dashboard", async (req, res) => {
      try {
        const links = await pool.query("SELECT * FROM links ORDER BY id DESC LIMIT 20");
        const reports = await pool.query("SELECT * FROM reports ORDER BY id DESC LIMIT 20");
        const leaderboard = await pool.query(`
          SELECT added_by, COUNT(*) AS total
          FROM links
          GROUP BY added_by
          ORDER BY total DESC
          LIMIT 10
        `);
  
        res.send(`
          <html>
            <head>
              <title>📊 Linktory Dashboard</title>
              <style>
                body { font-family: sans-serif; padding: 20px; background: #fafafa; }
                h1 { color: #e91e63; }
                h2 { color: #333; margin-top: 30px; }
                ul, ol { background: #fff; padding: 15px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
                li { margin-bottom: 6px; }
              </style>
            </head>
            <body>
              <h1>📊 Linktory Dashboard</h1>
              <h2>Recent Links</h2>
              <ul>${links.rows.map(l => `<li>${l.url} — by ${l.added_by}</li>`).join("")}</ul>
              <h2>Recent Reports</h2>
              <ul>${reports.rows.map(r => `<li>${r.url} — reported by ${r.reported_by}</li>`).join("")}</ul>
              <h2>Leaderboard</h2>
              <ol>${leaderboard.rows.map(r => `<li>${r.added_by} (${r.total})</li>`).join("")}</ol>
            </body>
          </html>
        `);
      } catch (err) {
        console.error("Error loading dashboard:", err);
        res.status(500).send("⚠️ Error loading dashboard.");
      }
    });
  
    // JSON endpoints
    app.get("/api/links", async (req, res) => {
      const result = await pool.query("SELECT * FROM links ORDER BY id DESC");
      res.json(result.rows);
    });
  
    app.get("/api/reports", async (req, res) => {
      const result = await pool.query("SELECT * FROM reports ORDER BY id DESC");
      res.json(result.rows);
    });
  }
  