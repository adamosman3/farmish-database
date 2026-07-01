// Verify message + user analytics queries. Run: node scripts/test-analytics.js
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
  query_timeout: 25000,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const msg = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS today,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE)) AS this_week,
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - 29 * INTERVAL '1 day') AS last_30d,
       COUNT(*)::float / GREATEST(EXTRACT(DAY FROM (MAX(created_at) - MIN(created_at))) + 1, 1) AS avg_all_time
     FROM messages`
  );
  console.log("MESSAGES:", msg.rows[0]);

  const conv = await pool.query(`SELECT COUNT(*) AS total_conversations FROM conversations`);
  console.log("CONVERSATIONS:", conv.rows[0]);

  const usr = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS new_today,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE)) AS new_this_week,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) AS new_this_month,
       COUNT(*) FILTER (WHERE last_sign_in_at >= CURRENT_DATE - 29 * INTERVAL '1 day') AS active_30d,
       COALESCE(AVG(sign_in_count), 0) AS avg_sign_in
     FROM users`
  );
  console.log("USERS:", usr.rows[0]);

  const role = await pool.query(
    `SELECT COALESCE(NULLIF(role, ''), 'unknown') AS label, COUNT(*) AS count
     FROM users GROUP BY 1 ORDER BY count DESC LIMIT 6`
  );
  console.log("BY ROLE:", role.rows);

  const sub = await pool.query(
    `SELECT COALESCE(NULLIF(subscription_type, ''), 'none') AS label, COUNT(*) AS count
     FROM users GROUP BY 1 ORDER BY count DESC LIMIT 6`
  );
  console.log("BY SUBSCRIPTION:", sub.rows);

  const msgTrend = await pool.query(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*) AS count
     FROM messages WHERE created_at >= CURRENT_DATE - 29 * INTERVAL '1 day'
     GROUP BY 1 ORDER BY 1`
  );
  console.log("MSG TREND (last 5):", msgTrend.rows.slice(-5));

  await pool.end();
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
