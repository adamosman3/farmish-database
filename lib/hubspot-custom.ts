import { withDurableCache, CachedResult } from "./cache";

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const BASE = "https://api.hubapi.com";

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
}

function requireToken() {
  if (!HUBSPOT_TOKEN) throw new Error("HUBSPOT_TOKEN must be configured in .env.local");
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function run(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

// ---- Catalog -------------------------------------------------------------

type DimensionType = "none" | "time" | "enum" | "emailState";

interface DimensionDef {
  key: string;
  label: string;
  type: DimensionType;
  trunc?: "day" | "week" | "month";
  property?: string; // for enum breakdowns
}

interface GroupDef {
  key: string;
  label: string;
  object: "contacts" | "companies" | "emails";
  dateProperty?: string;
  dimensions: DimensionDef[];
}

const timeDimensions: DimensionDef[] = [
  { key: "day", label: "By Day", type: "time", trunc: "day" },
  { key: "week", label: "By Week", type: "time", trunc: "week" },
  { key: "month", label: "By Month", type: "time", trunc: "month" },
];

const CATALOG: GroupDef[] = [
  {
    key: "contacts",
    label: "Contacts",
    object: "contacts",
    dateProperty: "createdate",
    dimensions: [
      { key: "none", label: "Single Total", type: "none" },
      ...timeDimensions,
      { key: "lifecyclestage", label: "By Lifecycle Stage", type: "enum", property: "lifecyclestage" },
      { key: "lead_status", label: "By Lead Status", type: "enum", property: "hs_lead_status" },
    ],
  },
  {
    key: "companies",
    label: "Companies",
    object: "companies",
    dateProperty: "createdate",
    dimensions: [
      { key: "none", label: "Single Total", type: "none" },
      ...timeDimensions,
      { key: "lifecyclestage", label: "By Lifecycle Stage", type: "enum", property: "lifecyclestage" },
    ],
  },
  {
    key: "emails",
    label: "Marketing Emails",
    object: "emails",
    dimensions: [
      { key: "none", label: "Single Total", type: "none" },
      { key: "state", label: "By State", type: "emailState" },
    ],
  },
];

// Contacts/companies support a Count metric only (CRM has no server-side aggregates).
const METRICS = [{ key: "count", label: "Count" }];

const RANGE_DAYS: Record<string, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
  all: null,
};

export function getHubspotCatalogOptions() {
  return CATALOG.map((g) => ({
    key: g.key,
    label: g.label,
    metrics: METRICS,
    dimensions: g.dimensions.map((d) => ({ key: d.key, label: d.label, type: d.type })),
  }));
}

// ---- Query execution -----------------------------------------------------

export interface CustomResult {
  chartType: "metric" | "line" | "bar";
  metricLabel: string;
  groupLabel: string;
  dimensionLabel: string;
  rows: { label: string; value: number }[];
}

// Simple in-memory cache to reduce repeated HubSpot calls (5 min TTL).
const cache = new Map<string, { at: number; data: CustomResult }>();
const CACHE_TTL = 5 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function searchTotal(
  object: string,
  filters: { propertyName: string; operator: string; value?: string }[]
): Promise<number> {
  const body = JSON.stringify({ filterGroups: filters.length ? [{ filters }] : [], limit: 1 });

  // The CRM Search API enforces a strict per-second rate limit; retry on 429.
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${BASE}/crm/v3/objects/${object}/search`, {
      method: "POST",
      headers: authHeaders(),
      body,
    });
    if (res.status === 429) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`HubSpot ${object} search error: ${res.status} ${text}`);
    }
    const json = await res.json();
    return json.total ?? 0;
  }
  throw new Error(`HubSpot ${object} search error: 429 rate limit exceeded after retries`);
}

async function enumOptions(object: string, property: string): Promise<{ label: string; value: string }[]> {
  const res = await fetch(`${BASE}/crm/v3/properties/${object}/${property}`, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HubSpot property ${property} error: ${res.status} ${text}`);
  }
  const json = await res.json();
  return (json.options ?? []).map((o: { label: string; value: string }) => ({ label: o.label, value: o.value }));
}

function rangeFilter(dateProperty: string, days: number | null) {
  if (days === null) return [];
  const since = Date.now() - (days - 1) * 24 * 60 * 60 * 1000;
  return [{ propertyName: dateProperty, operator: "GTE", value: String(since) }];
}

// Build time buckets [startMs, endMs) going back from today.
function buildBuckets(trunc: "day" | "week" | "month", days: number | null): { start: number; end: number; label: string }[] {
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  let count: number;
  if (trunc === "day") count = Math.min(days ?? 60, 60);
  else if (trunc === "week") count = Math.min(Math.ceil((days ?? 364) / 7), 52);
  else count = Math.min(Math.ceil((days ?? 730) / 30), 24);

  const buckets: { start: number; end: number; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const end = new Date(now);
    const start = new Date(now);
    if (trunc === "day") {
      end.setDate(now.getDate() - i);
      start.setDate(now.getDate() - i);
      start.setHours(0, 0, 0, 0);
    } else if (trunc === "week") {
      end.setDate(now.getDate() - i * 7);
      start.setDate(now.getDate() - i * 7 - 6);
      start.setHours(0, 0, 0, 0);
    } else {
      end.setMonth(now.getMonth() - i + 1, 0); // last day of that month
      start.setMonth(now.getMonth() - i, 1);
      start.setHours(0, 0, 0, 0);
    }
    buckets.push({
      start: start.getTime(),
      end: end.getTime(),
      label: start.toISOString().slice(0, 10),
    });
  }
  return buckets;
}

async function runHubspotCustomQueryLive(params: {
  group: string;
  metric: string;
  dimension: string;
  range: string;
}): Promise<CustomResult> {
  requireToken();

  const group = CATALOG.find((g) => g.key === params.group);
  if (!group) throw new Error(`Unknown group: ${params.group}`);
  const dimension = group.dimensions.find((d) => d.key === params.dimension);
  if (!dimension) throw new Error(`Unknown dimension '${params.dimension}' for '${params.group}'`);

  const days = params.range in RANGE_DAYS ? RANGE_DAYS[params.range] : 30;
  let result: CustomResult;

  // --- Emails group (uses marketing emails list, aggregated client-side) ---
  if (group.object === "emails") {
    const res = await fetch(`${BASE}/marketing/v3/emails?limit=100`, { headers: authHeaders() });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`HubSpot email list error: ${res.status} ${text}`);
    }
    const json = await res.json();
    const emails = (json.results ?? []) as Array<{ state?: string }>;

    if (dimension.type === "none") {
      result = {
        chartType: "metric",
        metricLabel: "Count",
        groupLabel: group.label,
        dimensionLabel: dimension.label,
        rows: [{ label: "Count", value: emails.length }],
      };
    } else {
      const counts = new Map<string, number>();
      for (const e of emails) {
        const key = e.state ?? "UNKNOWN";
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      result = {
        chartType: "bar",
        metricLabel: "Count",
        groupLabel: group.label,
        dimensionLabel: dimension.label,
        rows: Array.from(counts, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      };
    }
    return result;
  }

  const dateProperty = group.dateProperty!;

  // --- Single total ---
  if (dimension.type === "none") {
    const total = await searchTotal(group.object, rangeFilter(dateProperty, days));
    result = {
      chartType: "metric",
      metricLabel: "Count",
      groupLabel: group.label,
      dimensionLabel: dimension.label,
      rows: [{ label: "Count", value: total }],
    };
  }
  // --- Time series ---
  else if (dimension.type === "time") {
    const buckets = buildBuckets(dimension.trunc!, days);
    const values = await mapWithConcurrency(buckets, 3, async (b) =>
      searchTotal(group.object, [
        { propertyName: dateProperty, operator: "GTE", value: String(b.start) },
        { propertyName: dateProperty, operator: "LT", value: String(b.end + 1) },
      ])
    );
    result = {
      chartType: "line",
      metricLabel: "Count",
      groupLabel: group.label,
      dimensionLabel: dimension.label,
      rows: buckets.map((b, i) => ({ label: b.label, value: values[i] })),
    };
  }
  // --- Enum breakdown ---
  else {
    const options = await enumOptions(group.object, dimension.property!);
    const capped = options.slice(0, 25);
    const range = rangeFilter(dateProperty, days);
    const counts = await mapWithConcurrency(capped, 3, async (opt) => {
      const value = await searchTotal(group.object, [
        ...range,
        { propertyName: dimension.property!, operator: "EQ", value: opt.value },
      ]);
      return { label: opt.label, value };
    });
    result = {
      chartType: "bar",
      metricLabel: "Count",
      groupLabel: group.label,
      dimensionLabel: dimension.label,
      rows: counts.filter((c) => c.value > 0).sort((a, b) => b.value - a.value).slice(0, 15),
    };
  }

  return result;
}

// Durable cache with stale-on-error fallback, keyed by the exact query
// params. If HubSpot rate-limits or times out on a refresh, the widget keeps
// showing the last successfully fetched result instead of an error.
export function runHubspotCustomQueryCached(params: {
  group: string;
  metric: string;
  dimension: string;
  range: string;
}): Promise<CachedResult<CustomResult>> {
  const key = `hubspot:custom:${JSON.stringify(params)}`;
  return withDurableCache(key, CACHE_TTL, () => runHubspotCustomQueryLive(params));
}
