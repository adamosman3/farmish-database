import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  connectionTimeoutMillis: 10000,
  query_timeout: 15000,
  idleTimeoutMillis: 30000,
  max: 10,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function getTableNames(limit = 50): Promise<string[]> {
  const rows = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name LIMIT $1`,
    [limit]
  );
  return rows.map((r) => r.table_name);
}

export async function getTableRowCount(tableName: string): Promise<number> {
  const rows = await query<{ count: string }>(`SELECT COUNT(*) as count FROM "${tableName}"`);
  return parseInt(rows[0]?.count ?? "0", 10);
}

export async function getRecentRows(tableName: string, limit: number = 5): Promise<Record<string, any>[]> {
  return query(`SELECT * FROM "${tableName}" LIMIT $1`, [limit]);
}
