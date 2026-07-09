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

  // The two Amplitude calls are independent, so run them in parallel and
  // tolerate one of them failing: partial data beats a fully blank dashboard.
  // 1) Aggregate daily volume across all active events (segmentation).
  // 2) Top events breakdown ranked by the historical totals that events/list
  //    already returns, so no per-event segmentation calls are needed.
  const [activeResult, defsResult] = await Promise.allSettled([
    segmentation("_active", start, end, 1),
    fetchAmplitudeEventDefinitions(),
  ]);

  if (activeResult.status === "rejected" && defsResult.status === "rejected") {
    throw activeResult.reason instanceof Error
      ? activeResult.reason
      : new Error(String(activeResult.reason));
  }

  let daily: EventVolumePoint[] = [];
  let total = 0;
  if (activeResult.status === "fulfilled") {
    const activeData = activeResult.value;
    daily = (activeData.xValues ?? []).map((date, i) => ({
      date,
      count: activeData.series?.[0]?.[i] ?? 0,
    }));
    total = activeData.seriesCollapsed?.[0]?.[0]?.value ?? daily.reduce((s, d) => s + d.count, 0);
  } else {
    console.error("Amplitude segmentation failed, serving top events only:", activeResult.reason);
  }

  let topEvents: EventTotal[] = [];
  if (defsResult.status === "fulfilled") {
    topEvents = defsResult.value
      .filter((d) => (d.total ?? 0) > 0)
      .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
      .slice(0, topEventLimit)
      .map((d): EventTotal => ({ name: d.display || d.name, total: d.total ?? 0 }));
  } else {
    console.error("Amplitude events/list failed, serving volume only:", defsResult.reason);
  }

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
  startBackgroundWarmer();

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

// Background cache warmer. The app runs as a long-lived server (not
// serverless), so we proactively refresh the durable cache for the common
// day ranges every 10 minutes. Users then almost always hit a warm cache
// and never wait on (or get errors from) live Amplitude calls.
const WARM_INTERVAL_MS = 10 * 60 * 1000;
const WARM_DAY_RANGES = [7, 30, 90];
let warmerStarted = false;

function startBackgroundWarmer() {
  if (warmerStarted) return;
  warmerStarted = true;

  const warm = async () => {
    for (const days of WARM_DAY_RANGES) {
      try {
        await getAmplitudeVolumeCached(days);
      } catch (err) {
        console.error(`[amplitude-warmer] refresh failed for ${days}d:`, err);
      }
    }
  };

  const timer = setInterval(warm, WARM_INTERVAL_MS);
  // Don't keep the process alive just for the warmer.
  if (typeof timer.unref === "function") timer.unref();
}
