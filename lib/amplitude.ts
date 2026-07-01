const AMPLITUDE_API_KEY = process.env.AMPLITUDE_API_KEY;
const AMPLITUDE_SECRET_KEY = process.env.AMPLITUDE_SECRET_KEY;

export interface AmplitudeEventDefinition {
  id: number;
  name: string;
  display: string;
  value: string;
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

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
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

  const response = await fetchWithTimeout(url.toString(), {
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

  const response = await fetchWithTimeout("https://amplitude.com/api/2/events/list", {
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
    hidden: boolean;
    deleted: boolean;
    non_active: boolean;
  }>;

  return rows
    .filter((d) => !d.hidden && !d.deleted && !d.non_active)
    .map((d) => ({ id: d.id, name: d.name, display: d.display, value: d.value }));
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

  // 2) Per-event totals for the breakdown (single bucket per event).
  const definitions = await fetchAmplitudeEventDefinitions();
  const perEvent = await mapWithConcurrency(definitions, 8, async (def) => {
    try {
      const d = await segmentation(def.name, start, end, 30);
      const eventTotal = d.seriesCollapsed?.[0]?.[0]?.value ?? 0;
      return { name: def.display || def.name, total: eventTotal } as EventTotal;
    } catch {
      return { name: def.display || def.name, total: 0 } as EventTotal;
    }
  });

  const topEvents = perEvent
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, topEventLimit);

  const value: AmplitudeVolume = { total, daily, topEvents };
  volumeCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, value });
  return value;
}
