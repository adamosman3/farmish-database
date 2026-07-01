import { NextResponse } from "next/server";
import { getContactsSummary } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getContactsSummary();
    return NextResponse.json(data);
  } catch (error) {
    console.error("HubSpot contacts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch HubSpot contacts", details: String(error) },
      { status: 500 }
    );
  }
}
