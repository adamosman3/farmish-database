import { NextResponse } from "next/server";
import { getHubspotCatalogOptions, runHubspotCustomQueryCached } from "@/lib/hubspot-custom";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    if (!searchParams.get("group")) {
      return NextResponse.json({ catalog: getHubspotCatalogOptions() });
    }

    const { value, stale, updatedAt } = await runHubspotCustomQueryCached({
      group: searchParams.get("group") ?? "",
      metric: searchParams.get("metric") ?? "count",
      dimension: searchParams.get("dimension") ?? "none",
      range: searchParams.get("range") ?? "30d",
    });
    return NextResponse.json({ ...value, stale, updatedAt: updatedAt.toISOString() });
  } catch (error) {
    console.error("HubSpot custom metrics API error:", error);
    return NextResponse.json(
      { error: "Failed to run HubSpot custom query", details: String(error) },
      { status: 500 }
    );
  }
}
