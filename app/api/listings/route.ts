import { NextResponse } from "next/server";
import { getListingsAnalytics } from "@/lib/listings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") ?? "30", 10);
    const locationDays = parseInt(searchParams.get("locationDays") ?? "7", 10);
    const categoryDays = parseInt(searchParams.get("categoryDays") ?? "30", 10);
    const analytics = await getListingsAnalytics(
      Number.isFinite(days) ? days : 30,
      Number.isFinite(locationDays) ? locationDays : 7,
      Number.isFinite(categoryDays) ? categoryDays : 30
    );
    return NextResponse.json(analytics);
  } catch (error) {
    console.error("Listings API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch listings analytics", details: String(error) },
      { status: 500 }
    );
  }
}
