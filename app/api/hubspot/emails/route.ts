import { NextResponse } from "next/server";
import { getEmailPerformance } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const emails = await getEmailPerformance();
    return NextResponse.json({ emails });
  } catch (error) {
    console.error("HubSpot emails error:", error);
    return NextResponse.json(
      { error: "Failed to fetch HubSpot email performance", details: String(error) },
      { status: 500 }
    );
  }
}
