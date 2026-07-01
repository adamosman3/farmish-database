import { NextResponse } from "next/server";
import { getCompaniesSummary } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getCompaniesSummary();
    return NextResponse.json(data);
  } catch (error) {
    console.error("HubSpot companies error:", error);
    return NextResponse.json(
      { error: "Failed to fetch HubSpot companies", details: String(error) },
      { status: 500 }
    );
  }
}
