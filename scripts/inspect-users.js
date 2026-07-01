// Inspect user subscription + state data. Run: node scripts/inspect-users.js
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
  // Raw subscription_type distribution (including null/empty)
  const sub = await pool.query(
    `SELECT subscription_type, COUNT(*) AS count
     FROM users GROUP BY subscription_type ORDER BY count DESC`
  );
  console.log("SUBSCRIPTION_TYPE (raw):");
  for (const r of sub.rows) console.log(`  ${JSON.stringify(r.subscription_type)} : ${r.count}`);

  // State: null vs empty vs populated
  const stateStats = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE state IS NULL) AS null_state,
       COUNT(*) FILTER (WHERE state = '') AS empty_state,
       COUNT(*) FILTER (WHERE state IS NOT NULL AND state <> '') AS has_state,
       COUNT(*) AS total
     FROM users`
  );
  console.log("\nSTATE presence:", stateStats.rows[0]);

  const topStates = await pool.query(
    `SELECT state, COUNT(*) AS count FROM users
     WHERE state IS NOT NULL AND state <> ''
     GROUP BY state ORDER BY count DESC LIMIT 15`
  );
  console.log("\nTOP STATES (populated only):");
  for (const r of topStates.rows) console.log(`  ${JSON.stringify(r.state)} : ${r.count}`);

  // City presence for comparison
  const cityStats = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE city IS NOT NULL AND city <> '') AS has_city,
       COUNT(*) AS total
     FROM users`
  );
  console.log("\nCITY presence:", cityStats.rows[0]);

  // Other possible plan indicators
  const marketMember = await pool.query(
    `SELECT market_member, COUNT(*) AS count FROM users GROUP BY market_member ORDER BY count DESC`
  );
  console.log("\nMARKET_MEMBER:", marketMember.rows);

  const stripe = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE stripe_customer_id IS NOT NULL AND stripe_customer_id <> '') AS has_stripe,
            COUNT(*) FILTER (WHERE stripe_connect_account_id IS NOT NULL AND stripe_connect_account_id <> '') AS has_connect
     FROM users`
  );
  console.log("\nSTRIPE linkage:", stripe.rows[0]);

  await pool.end();
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
