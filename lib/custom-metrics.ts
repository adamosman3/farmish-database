import { query } from "./db";

// A whitelisted catalog of groups, metrics, and dimensions. All SQL fragments
// come from this catalog only — user input is validated against these keys, so
// there is no arbitrary SQL / injection surface.

type DimensionType = "none" | "time" | "category";

interface MetricDef {
  key: string;
  label: string;
  expr: string; // aggregate SQL expression
}

interface DimensionDef {
  key: string;
  label: string;
  type: DimensionType;
  expr?: string; // grouping expression (for category type)
  trunc?: "day" | "week" | "month"; // for time type
  filterColumn?: string; // when set, exclude NULL/empty of this column
}

interface GroupDef {
  key: string;
  label: string;
  table: string;
  dateColumn: string;
  metrics: MetricDef[];
  dimensions: DimensionDef[];
}

const timeDimensions: DimensionDef[] = [
  { key: "day", label: "By Day", type: "time", trunc: "day" },
  { key: "week", label: "By Week", type: "time", trunc: "week" },
  { key: "month", label: "By Month", type: "time", trunc: "month" },
];

const noneDimension: DimensionDef = { key: "none", label: "Single Total", type: "none" };

export const CATALOG: GroupDef[] = [
  {
    key: "listings",
    label: "Listings",
    table: "items",
    dateColumn: "created_at",
    metrics: [
      { key: "count", label: "Count", expr: "COUNT(*)" },
      { key: "avg_price", label: "Average Price", expr: "AVG(NULLIF(price, 0))" },
      { key: "total_value", label: "Total Value", expr: "SUM(price)" },
    ],
    dimensions: [
      noneDimension,
      ...timeDimensions,
      { key: "category", label: "By Category", type: "category", expr: "COALESCE(NULLIF(cached_category_name, ''), 'Uncategorized')" },
      { key: "state", label: "By State", type: "category", expr: "UPPER(TRIM(state))", filterColumn: "state" },
      { key: "listing_type", label: "By Listing Type", type: "category", expr: "COALESCE(listing_type::text, 'unknown')" },
    ],
  },
  {
    key: "messages",
    label: "Messages",
    table: "messages",
    dateColumn: "created_at",
    metrics: [{ key: "count", label: "Count", expr: "COUNT(*)" }],
    dimensions: [noneDimension, ...timeDimensions],
  },
  {
    key: "conversations",
    label: "Conversations",
    table: "conversations",
    dateColumn: "created_at",
    metrics: [{ key: "count", label: "Count", expr: "COUNT(*)" }],
    dimensions: [noneDimension, ...timeDimensions],
  },
  {
    key: "users",
    label: "Users",
    table: "users",
    dateColumn: "created_at",
    metrics: [
      { key: "count", label: "Count", expr: "COUNT(*)" },
      { key: "avg_signins", label: "Avg Sign-ins", expr: "AVG(sign_in_count)" },
    ],
    dimensions: [
      noneDimension,
      ...timeDimensions,
      { key: "subscription", label: "By Subscription", type: "category", expr: "COALESCE(NULLIF(subscription_type, ''), 'none')" },
      { key: "state", label: "By State", type: "category", expr: "UPPER(TRIM(state))", filterColumn: "state" },
      { key: "signup_method", label: "By Signup Method", type: "category", expr: "COALESCE(NULLIF(signup_method, ''), 'unknown')" },
    ],
  },
];

export const TIME_RANGES: Record<string, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
  all: null,
};

// A trimmed catalog safe to send to the client for building the UI.
export function getCatalogOptions() {
  return CATALOG.map((g) => ({
    key: g.key,
    label: g.label,
    metrics: g.metrics.map((m) => ({ key: m.key, label: m.label })),
    dimensions: g.dimensions.map((d) => ({ key: d.key, label: d.label, type: d.type })),
  }));
}

export interface CustomResult {
  chartType: "metric" | "line" | "bar";
  metricLabel: string;
  groupLabel: string;
  dimensionLabel: string;
  rows: { label: string; value: number }[];
}

export async function runCustomQuery(params: {
  group: string;
  metric: string;
  dimension: string;
  range: string;
}): Promise<CustomResult> {
  const group = CATALOG.find((g) => g.key === params.group);
  if (!group) throw new Error(`Unknown group: ${params.group}`);

  const metric = group.metrics.find((m) => m.key === params.metric);
  if (!metric) throw new Error(`Unknown metric '${params.metric}' for group '${params.group}'`);

  const dimension = group.dimensions.find((d) => d.key === params.dimension);
  if (!dimension) throw new Error(`Unknown dimension '${params.dimension}' for group '${params.group}'`);

  const days = params.range in TIME_RANGES ? TIME_RANGES[params.range] : 30;

  const whereClauses: string[] = [];
  if (days !== null) {
    whereClauses.push(`${group.dateColumn} >= CURRENT_DATE - ${days - 1} * INTERVAL '1 day'`);
  }
  if (dimension.type === "category" && dimension.filterColumn) {
    whereClauses.push(`${dimension.filterColumn} IS NOT NULL AND TRIM(${dimension.filterColumn}) <> ''`);
  }
  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // Single total (no grouping)
  if (dimension.type === "none") {
    const rows = await query<{ value: string }>(
      `SELECT ${metric.expr} AS value FROM ${group.table} ${whereSql}`
    );
    return {
      chartType: "metric",
      metricLabel: metric.label,
      groupLabel: group.label,
      dimensionLabel: dimension.label,
      rows: [{ label: metric.label, value: round(rows[0]?.value) }],
    };
  }

  // Time series (grouped by truncated date)
  if (dimension.type === "time") {
    const rows = await query<{ label: string; value: string }>(
      `SELECT to_char(date_trunc('${dimension.trunc}', ${group.dateColumn}), 'YYYY-MM-DD') AS label,
              ${metric.expr} AS value
       FROM ${group.table} ${whereSql}
       GROUP BY 1 ORDER BY 1`
    );
    return {
      chartType: "line",
      metricLabel: metric.label,
      groupLabel: group.label,
      dimensionLabel: dimension.label,
      rows: rows.map((r) => ({ label: r.label, value: round(r.value) })),
    };
  }

  // Category breakdown (bar)
  const rows = await query<{ label: string | null; value: string }>(
    `SELECT ${dimension.expr} AS label, ${metric.expr} AS value
     FROM ${group.table} ${whereSql}
     GROUP BY 1 ORDER BY value DESC NULLS LAST LIMIT 15`
  );
  return {
    chartType: "bar",
    metricLabel: metric.label,
    groupLabel: group.label,
    dimensionLabel: dimension.label,
    rows: rows.map((r) => ({ label: r.label ?? "unknown", value: round(r.value) })),
  };
}

function round(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
