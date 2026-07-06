import { NextResponse } from "next/server";
import { getMessageAnalytics, getUserAnalytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") ?? "30", 10);
    const trendDays = Number.isFinite(days) ? days : 30;
    const [messages, users] = await Promise.all([
      getMessageAnalytics(trendDays),
      getUserAnalytics(trendDays),
    ]);
    return NextResponse.json({ messages, users });
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics", details: String(error) },
      { status: 500 }
    );
  }
}
