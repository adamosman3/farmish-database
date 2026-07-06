import { query } from "./db";

// Durable, cross-instance cache backed by Postgres. Serverless functions get
// fresh cold instances often, so an in-memory cache alone doesn't protect
// against slow/rate-limited/flaky upstream APIs (Amplitude, HubSpot). This
// cache persists across instances and — critically — lets us serve the last
// known-good value if a live refresh fails, instead of showing an error.

let tableReady: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = query(
      `CREATE TABLE IF NOT EXISTS app_cache (
         key TEXT PRIMARY KEY,
         value JSONB NOT NULL,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`
    ).then(() => undefined);
  }
  return tableReady;
}

interface CacheEntry<T> {
  value: T;
  updatedAt: Date;
}

async function getCacheEntry<T>(key: string): Promise<CacheEntry<T> | null> {
  await ensureTable();
  const rows = await query<{ value: T; updated_at: string }>(
    `SELECT value, updated_at FROM app_cache WHERE key = $1`,
    [key]
  );
  if (!rows[0]) return null;
  return { value: rows[0].value, updatedAt: new Date(rows[0].updated_at) };
}

async function setCacheEntry<T>(key: string, value: T): Promise<void> {
  await ensureTable();
  await query(
    `INSERT INTO app_cache (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}

export interface CachedResult<T> {
  value: T;
  stale: boolean;
  updatedAt: Date;
}

/**
 * Fetch-through cache with stale-on-error fallback.
 * - Cache hit within ttlMs: return it immediately (fast path).
 * - Cache miss/expired: call fetcher(). On success, cache and return fresh.
 *   On failure, fall back to the last cached value (however old) if one
 *   exists, so the UI never goes blank just because a live call timed out
 *   or hit a rate limit. Only throws if there's truly no cached value yet.
 */
export async function withDurableCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<CachedResult<T>> {
  let cached: CacheEntry<T> | null = null;
  try {
    cached = await getCacheEntry<T>(key);
  } catch (err) {
    console.error(`[cache] read failed for "${key}":`, err);
  }

  const isFresh = !!cached && Date.now() - cached.updatedAt.getTime() < ttlMs;
  if (isFresh && cached) {
    return { value: cached.value, stale: false, updatedAt: cached.updatedAt };
  }

  try {
    const fresh = await fetcher();
    setCacheEntry(key, fresh).catch((err) => console.error(`[cache] write failed for "${key}":`, err));
    return { value: fresh, stale: false, updatedAt: new Date() };
  } catch (err) {
    if (cached) {
      console.error(
        `[cache] live fetch failed for "${key}", serving stale data from ${cached.updatedAt.toISOString()}:`,
        err
      );
      return { value: cached.value, stale: true, updatedAt: cached.updatedAt };
    }
    throw err;
  }
}
