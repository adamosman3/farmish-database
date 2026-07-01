import { query } from "./db";

// The marketplace "listings" live in the Postgres `items` table.
// Relevant columns: created_at, city, state, zip, cached_category_name,
// archived, listing_type, price.

export interface ListingsSummary {
  createdToday: number;
  createdThisWeek: number;
  createdThisMonth: number;
  total: number;
  active: number;
  archived: number;
}

export interface TimeBucket {
  date: string;
  count: number;
}

export interface LocationCount {
  location: string;
  city: string | null;
  state: string | null;
  count: number;
}

export interface LabeledCount {
  label: string;
  count: number;
}

export interface ListingsAnalytics {
  summary: ListingsSummary;
  dailyTrend: TimeBucket[];
  topLocationsThisWeek: LocationCount[];
  byCategory: LabeledCount[];
  byListingType: LabeledCount[];
  byState: LabeledCount[];
}

export async function getListingsSummary(): Promise<ListingsSummary> {
  const rows = await query<{
    created_today: string;
    created_this_week: string;
    created_this_month: string;
    total: string;
    active: string;
    archived: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS created_today,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE)) AS created_this_week,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) AS created_this_month,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE archived = false) AS active,
       COUNT(*) FILTER (WHERE archived = true) AS archived
     FROM items`
  );
  const r = rows[0];
  return {
    createdToday: parseInt(r?.created_today ?? "0", 10),
    createdThisWeek: parseInt(r?.created_this_week ?? "0", 10),
    createdThisMonth: parseInt(r?.created_this_month ?? "0", 10),
    total: parseInt(r?.total ?? "0", 10),
    active: parseInt(r?.active ?? "0", 10),
    archived: parseInt(r?.archived ?? "0", 10),
  };
}

export async function getDailyTrend(days = 30): Promise<TimeBucket[]> {
  const rows = await query<{ day: string; count: string }>(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
            COUNT(*) AS count
     FROM items
     WHERE created_at >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
     GROUP BY 1
     ORDER BY 1`,
    [days]
  );
  return rows.map((r) => ({ date: r.day, count: parseInt(r.count, 10) }));
}

export async function getTopLocationsThisWeek(limit = 10): Promise<LocationCount[]> {
  const rows = await query<{ city: string | null; state: string | null; count: string }>(
    `SELECT city, state, COUNT(*) AS count
     FROM items
     WHERE created_at >= date_trunc('week', CURRENT_DATE)
       AND (NULLIF(city, '') IS NOT NULL OR NULLIF(state, '') IS NOT NULL)
     GROUP BY city, state
     ORDER BY count DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    city: r.city,
    state: r.state,
    location: [r.city, r.state].filter(Boolean).join(", ") || "Unknown",
    count: parseInt(r.count, 10),
  }));
}

export async function getByCategory(limit = 10): Promise<LabeledCount[]> {
  const rows = await query<{ label: string | null; count: string }>(
    `SELECT COALESCE(cached_category_name, 'Uncategorized') AS label, COUNT(*) AS count
     FROM items
     GROUP BY 1
     ORDER BY count DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({ label: r.label ?? "Uncategorized", count: parseInt(r.count, 10) }));
}

export async function getByListingType(): Promise<LabeledCount[]> {
  const rows = await query<{ label: string | null; count: string }>(
    `SELECT COALESCE(listing_type::text, 'Unknown') AS label, COUNT(*) AS count
     FROM items
     GROUP BY 1
     ORDER BY count DESC`
  );
  return rows.map((r) => ({ label: r.label ?? "Unknown", count: parseInt(r.count, 10) }));
}

export async function getByState(limit = 15): Promise<LabeledCount[]> {
  const rows = await query<{ label: string | null; count: string }>(
    `SELECT COALESCE(NULLIF(state, ''), 'Unknown') AS label, COUNT(*) AS count
     FROM items
     GROUP BY 1
     ORDER BY count DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({ label: r.label ?? "Unknown", count: parseInt(r.count, 10) }));
}

export async function getListingsAnalytics(): Promise<ListingsAnalytics> {
  const [summary, dailyTrend, topLocationsThisWeek, byCategory, byListingType, byState] =
    await Promise.all([
      getListingsSummary(),
      getDailyTrend(30),
      getTopLocationsThisWeek(10),
      getByCategory(10),
      getByListingType(),
      getByState(15),
    ]);

  return {
    summary,
    dailyTrend,
    topLocationsThisWeek,
    byCategory,
    byListingType,
    byState,
  };
}
