import { NextResponse } from "next/server";
import { getTableNames, getTableRowCount, getRecentRows } from "@/lib/db";

export async function GET() {
  try {
    const tables = await getTableNames(20);
    const summaries = await Promise.all(
      tables.map(async (tableName) => {
        const count = await getTableRowCount(tableName);
        const sample = await getRecentRows(tableName, 3);
        return {
          name: tableName,
          rowCount: count,
          sample,
        };
      })
    );

    return NextResponse.json({ tables: summaries });
  } catch (error) {
    console.error("Postgres API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Postgres data", details: String(error) },
      { status: 500 }
    );
  }
}
