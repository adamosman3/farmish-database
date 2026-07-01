// One-off schema introspection helper. Run with: node scripts/introspect.js
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Minimal .env.local loader (avoids extra deps)
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
  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
  );
  const targets = ["messages", "conversations", "participants", "message_receipts", "users"];

  for (const t of targets) {
    console.log(`\n=== COLUMNS for ${t} ===`);
    try {
      const cols = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
        [t]
      );
      for (const c of cols.rows) console.log(`  ${c.column_name} : ${c.data_type}`);
    } catch (e) {
      console.log("  error:", e.message);
    }
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
