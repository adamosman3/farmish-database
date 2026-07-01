import { NextResponse } from "next/server";
import { getMessageAnalytics, getUserAnalytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [messages, users] = await Promise.all([getMessageAnalytics(), getUserAnalytics()]);
    return NextResponse.json({ messages, users });
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics", details: String(error) },
      { status: 500 }
    );
  }
}
