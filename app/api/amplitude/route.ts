import { NextResponse } from "next/server";
import { fetchAmplitudeVolume } from "@/lib/amplitude";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start") ?? getDefaultStartDate();
    const end = searchParams.get("end") ?? getDefaultEndDate();

    const volume = await fetchAmplitudeVolume(start, end);
    return NextResponse.json(volume);
  } catch (error) {
    console.error("Amplitude API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Amplitude data", details: String(error) },
      { status: 500 }
    );
  }
}

function getDefaultStartDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return date.toISOString().split("T")[0];
}

function getDefaultEndDate(): string {
  return new Date().toISOString().split("T")[0];
}
