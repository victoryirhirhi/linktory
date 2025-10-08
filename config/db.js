import pkg from "pg";
const { Pool } = pkg;

// Connect PostgreSQL using Render's environment variable
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Optional: verify connection
pool.connect()
  .then(() => console.log("✅ Database connected successfully"))
  .catch((err) => console.error("❌ Database connection error:", err.stack));
