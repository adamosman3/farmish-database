import { NextResponse } from "next/server";
import { getEmailPerformanceCached } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { value, stale, updatedAt } = await getEmailPerformanceCached();
    return NextResponse.json({ emails: value, stale, updatedAt: updatedAt.toISOString() });
  } catch (error) {
    console.error("HubSpot emails error:", error);
    return NextResponse.json(
      { error: "Failed to fetch HubSpot email performance", details: String(error) },
      { status: 500 }
    );
  }
}
