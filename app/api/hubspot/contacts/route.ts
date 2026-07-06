import { NextResponse } from "next/server";
import { getContactsSummaryCached } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { value, stale, updatedAt } = await getContactsSummaryCached();
    return NextResponse.json({ ...value, stale, updatedAt: updatedAt.toISOString() });
  } catch (error) {
    console.error("HubSpot contacts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch HubSpot contacts", details: String(error) },
      { status: 500 }
    );
  }
}
