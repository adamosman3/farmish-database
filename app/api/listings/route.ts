import { NextResponse } from "next/server";
import { getListingsAnalytics } from "@/lib/listings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const analytics = await getListingsAnalytics();
    return NextResponse.json(analytics);
  } catch (error) {
    console.error("Listings API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch listings analytics", details: String(error) },
      { status: 500 }
    );
  }
}
