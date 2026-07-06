import { NextResponse } from "next/server";
import { getCompaniesSummaryCached } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { value, stale, updatedAt } = await getCompaniesSummaryCached();
    return NextResponse.json({ ...value, stale, updatedAt: updatedAt.toISOString() });
  } catch (error) {
    console.error("HubSpot companies error:", error);
    return NextResponse.json(
      { error: "Failed to fetch HubSpot companies", details: String(error) },
      { status: 500 }
    );
  }
}
