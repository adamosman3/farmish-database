// Verify listings analytics queries. Run: node scripts/test-listings.js
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  connectionTimeoutMillis: 10000,
  query_timeout: 20000,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const summary = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS created_today,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE)) AS created_this_week,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) AS created_this_month,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE archived = false) AS active,
       COUNT(*) FILTER (WHERE archived = true) AS archived
     FROM items`
  );
  console.log("SUMMARY:", summary.rows[0]);

  const loc = await pool.query(
    `SELECT city, state, COUNT(*) AS count FROM items
     WHERE created_at >= date_trunc('week', CURRENT_DATE)
       AND (city IS NOT NULL OR state IS NOT NULL)
     GROUP BY city, state ORDER BY count DESC LIMIT 10`
  );
  console.log("TOP LOCATIONS THIS WEEK:", loc.rows);

  const cat = await pool.query(
    `SELECT COALESCE(cached_category_name, 'Uncategorized') AS label, COUNT(*) AS count
     FROM items GROUP BY 1 ORDER BY count DESC LIMIT 5`
  );
  console.log("BY CATEGORY (top 5):", cat.rows);

  const type = await pool.query(
    `SELECT COALESCE(listing_type::text, 'Unknown') AS label, COUNT(*) AS count
     FROM items GROUP BY 1 ORDER BY count DESC`
  );
  console.log("BY LISTING TYPE:", type.rows);

  const trend = await pool.query(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*) AS count
     FROM items WHERE created_at >= CURRENT_DATE - 29 * INTERVAL '1 day'
     GROUP BY 1 ORDER BY 1`
  );
  console.log("DAILY TREND (last rows):", trend.rows.slice(-5));

  await pool.end();
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
