import { NextResponse } from "next/server";
import { fetchAmplitudeVolume, getAmplitudeVolumeCached } from "@/lib/amplitude";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const daysParam = parseInt(searchParams.get("days") ?? "", 10);
    const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 30;
    const explicitStart = searchParams.get("start");
    const explicitEnd = searchParams.get("end");

    // Default path: durable cache with stale-on-error fallback, so a slow or
    // rate-limited Amplitude call never results in a blank/error dashboard.
    if (!explicitStart && !explicitEnd) {
      const { value, stale, updatedAt } = await getAmplitudeVolumeCached(days);
      return NextResponse.json({ ...value, stale, updatedAt: updatedAt.toISOString() });
    }

    // Explicit date override: bypass durable cache, fetch live.
    const start = explicitStart ?? getDefaultStartDate(days);
    const end = explicitEnd ?? getDefaultEndDate();
    const volume = await fetchAmplitudeVolume(start, end);
    return NextResponse.json({ ...volume, stale: false, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Amplitude API error:", error);
    const message = error instanceof Error ? error.message : String(error);
    const missingCreds = !process.env.AMPLITUDE_API_KEY || !process.env.AMPLITUDE_SECRET_KEY;
    return NextResponse.json(
      {
        error: missingCreds
          ? "Amplitude credentials are not configured on this server"
          : `Amplitude fetch failed: ${message}`,
      },
      { status: 500 }
    );
  }
}

function getDefaultStartDate(days = 30): string {
  const date = new Date();
  date.setDate(date.getDate() - (days - 1));
  return date.toISOString().split("T")[0];
}

function getDefaultEndDate(): string {
  return new Date().toISOString().split("T")[0];
}
