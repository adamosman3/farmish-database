import { NextResponse } from "next/server";
import { getCatalogOptions, runCustomQuery } from "@/lib/custom-metrics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // No params → return the catalog for building the UI.
    if (!searchParams.get("group")) {
      return NextResponse.json({ catalog: getCatalogOptions() });
    }

    const result = await runCustomQuery({
      group: searchParams.get("group") ?? "",
      metric: searchParams.get("metric") ?? "count",
      dimension: searchParams.get("dimension") ?? "none",
      range: searchParams.get("range") ?? "30d",
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Custom metrics API error:", error);
    return NextResponse.json(
      { error: "Failed to run custom query", details: String(error) },
      { status: 500 }
    );
  }
}
