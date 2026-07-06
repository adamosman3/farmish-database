import { withDurableCache, CachedResult } from "./cache";

const AMPLITUDE_API_KEY = process.env.AMPLITUDE_API_KEY;
const AMPLITUDE_SECRET_KEY = process.env.AMPLITUDE_SECRET_KEY;

export interface AmplitudeEventDefinition {
  id: number;
  name: string;
  display: string;
  value: string;
  total?: number;
}

export interface EventVolumePoint {
  date: string;
  count: number;
}

export interface EventTotal {
  name: string;
  total: number;
}

export interface AmplitudeVolume {
  total: number;
  daily: EventVolumePoint[];
  topEvents: EventTotal[];
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${AMPLITUDE_API_KEY}:${AMPLITUDE_SECRET_KEY}`).toString("base64")}`;
}

// Amplitude dashboard REST API expects compact YYYYMMDD dates.
function toCompactDate(input: string): string {
  return input.replace(/-/g, "").slice(0, 8);
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retry transient failures (rate limits, 5xx, timeouts/aborts) with backoff.
// Amplitude's API can be flaky under load; without this, a single blip fails
// the whole dashboard fetch.
async function fetchWithRetry(url: string, options: RequestInit, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Amplitude transient error: ${res.status}`);
        if (attempt < attempts - 1) {
          await sleep(500 * Math.pow(2, attempt));
          continue;
        }
        return res;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < attempts - 1) {
        await sleep(500 * Math.pow(2, attempt));
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Amplitude request failed after retries");
}

interface SegmentationResponse {
  data: {
    series: number[][];
    seriesCollapsed: Array<Array<{ setId: string; value: number }>>;
    seriesLabels: number[];
    xValues: string[];
  };
}

async function segmentation(
  eventType: string,
  start: string,
  end: string,
  interval: number,
  metric = "totals"
): Promise<SegmentationResponse["data"]> {
  if (!AMPLITUDE_API_KEY || !AMPLITUDE_SECRET_KEY) {
    throw new Error("AMPLITUDE_API_KEY and AMPLITUDE_SECRET_KEY must be configured");
  }

  const url = new URL("https://amplitude.com/api/2/events/segmentation");
  url.searchParams.set("e", JSON.stringify({ event_type: eventType }));
  url.searchParams.set("start", toCompactDate(start));
  url.searchParams.set("end", toCompactDate(end));
  url.searchParams.set("m", metric);
  url.searchParams.set("i", String(interval));

  const response = await fetchWithRetry(url.toString(), {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Amplitude segmentation error: ${response.status} ${text}`);
  }

  const json = (await response.json()) as SegmentationResponse;
  return json.data;
}

export async function fetchAmplitudeEventDefinitions(): Promise<AmplitudeEventDefinition[]> {
  if (!AMPLITUDE_API_KEY || !AMPLITUDE_SECRET_KEY) {
    throw new Error("AMPLITUDE_API_KEY and AMPLITUDE_SECRET_KEY must be configured");
  }

  const response = await fetchWithRetry("https://amplitude.com/api/2/events/list", {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Amplitude API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const rows = (data.data ?? []) as Array<{
    id: number;
    name: string;
    display: string;
    value: string;
    totals: number;
    hidden: boolean;
    deleted: boolean;
    non_active: boolean;
  }>;

  return rows
    .filter((d) => !d.hidden && !d.deleted && !d.non_active)
    .map((d) => ({ id: d.id, name: d.name, display: d.display, value: d.value, total: d.totals }));
}

// Run async tasks with a bounded concurrency to avoid rate limits.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(runners);
  return results;
}

// Simple in-memory cache so only the first (cold) request per window is slow.
// Amplitude also caches server-side; this smooths our own cold starts.
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const volumeCache = new Map<string, { expires: number; value: AmplitudeVolume }>();

/**
 * Fetches real event volume using the Amplitude segmentation API.
 * - total + daily trend come from the aggregate "_active" pseudo-event.
 * - per-event totals come from individual segmentation calls (batched).
 */
export async function fetchAmplitudeVolume(
  start: string,
  end: string,
  topEventLimit = 10
): Promise<AmplitudeVolume> {
  const cacheKey = `${start}:${end}:${topEventLimit}`;
  const cached = volumeCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  // 1) Aggregate daily volume across all active events.
  const activeData = await segmentation("_active", start, end, 1);
  const daily: EventVolumePoint[] = (activeData.xValues ?? []).map((date, i) => ({
    date,
    count: activeData.series?.[0]?.[i] ?? 0,
  }));
  const total = activeData.seriesCollapsed?.[0]?.[0]?.value ?? daily.reduce((s, d) => s + d.count, 0);

  // 2) Top events breakdown.
  // The events/list endpoint already returns historical totals per event, so
  // we can rank the top N directly without making one segmentation call per
  // event. This reduces the Amplitude cold-start from ~40 API calls to just 2.
  const definitions = await fetchAmplitudeEventDefinitions();
  const topEvents = definitions
    .filter((d) => (d.total ?? 0) > 0)
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    .slice(0, topEventLimit)
    .map((d): EventTotal => ({ name: d.display || d.name, total: d.total ?? 0 }));

  const value: AmplitudeVolume = { total, daily, topEvents };
  volumeCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, value });
  return value;
}

// Durable, cross-instance cache with stale-on-error fallback. If a live
// Amplitude fetch fails or times out, the dashboard serves the last
// successfully fetched volume instead of an error.
const DURABLE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function getAmplitudeVolumeCached(
  days: number,
  topEventLimit = 10
): Promise<CachedResult<AmplitudeVolume>> {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  const startStr = start.toISOString().split("T")[0];
  const endStr = end.toISOString().split("T")[0];

  return withDurableCache(
    `amplitude:volume:v1:${days}:${topEventLimit}`,
    DURABLE_TTL_MS,
    () => fetchAmplitudeVolume(startStr, endStr, topEventLimit)
  );
}
