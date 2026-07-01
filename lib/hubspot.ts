const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const BASE = "https://api.hubapi.com";

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${HUBSPOT_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function requireToken() {
  if (!HUBSPOT_TOKEN) {
    throw new Error("HUBSPOT_TOKEN must be configured in .env.local");
  }
}

// ---- CRM: contacts & companies ------------------------------------------

interface CrmRecord {
  id: string;
  properties: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
}

export interface ObjectSummary {
  total: number;
  createdThisWeek: number;
  createdThisMonth: number;
  recent: CrmRecord[];
}

function startOfWeekMs(): number {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday=0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

function startOfMonthMs(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

async function searchCount(objectType: string, sinceMs?: number): Promise<number> {
  const body: Record<string, unknown> = { limit: 1 };
  if (sinceMs !== undefined) {
    body.filterGroups = [
      { filters: [{ propertyName: "createdate", operator: "GTE", value: String(sinceMs) }] },
    ];
  } else {
    body.filterGroups = [];
  }

  const res = await fetchWithTimeout(`${BASE}/crm/v3/objects/${objectType}/search`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HubSpot ${objectType} search error: ${res.status} ${text}`);
  }
  const json = await res.json();
  return json.total ?? 0;
}

async function recentRecords(objectType: string, properties: string[], limit = 10): Promise<CrmRecord[]> {
  const res = await fetchWithTimeout(`${BASE}/crm/v3/objects/${objectType}/search`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      filterGroups: [],
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      properties,
      limit,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HubSpot ${objectType} recent error: ${res.status} ${text}`);
  }
  const json = await res.json();
  return (json.results ?? []) as CrmRecord[];
}

async function objectSummary(objectType: string, properties: string[]): Promise<ObjectSummary> {
  requireToken();
  const [total, createdThisWeek, createdThisMonth, recent] = await Promise.all([
    searchCount(objectType),
    searchCount(objectType, startOfWeekMs()),
    searchCount(objectType, startOfMonthMs()),
    recentRecords(objectType, properties),
  ]);
  return { total, createdThisWeek, createdThisMonth, recent };
}

export async function getContactsSummary(): Promise<ObjectSummary> {
  return objectSummary("contacts", ["email", "firstname", "lastname", "createdate", "lifecyclestage"]);
}

export async function getCompaniesSummary(): Promise<ObjectSummary> {
  return objectSummary("companies", ["name", "domain", "city", "state", "createdate", "industry"]);
}

// ---- Marketing email performance (by subject line) ----------------------

export interface EmailPerformance {
  id: string;
  name: string;
  subject: string;
  state: string;
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  bounces: number;
  openRate: number; // 0..1
  clickRate: number; // 0..1
  bounceRate: number; // 0..1
}

interface HubspotEmail {
  id: string;
  name: string;
  subject: string;
  state: string;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

// Run async tasks with bounded concurrency to avoid HubSpot rate limits.
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
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function listMarketingEmails(limit: number): Promise<HubspotEmail[]> {
  const res = await fetchWithTimeout(`${BASE}/marketing/v3/emails?limit=${limit}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HubSpot email list error: ${res.status} ${text}`);
  }
  const json = await res.json();
  return ((json.results ?? []) as Array<Record<string, any>>).map((e) => ({
    id: String(e.id),
    name: e.name ?? "(untitled)",
    subject: e.subject ?? "",
    state: e.state ?? "UNKNOWN",
  }));
}

async function fetchEmailStats(
  emailId: string,
  startIso: string,
  endIso: string
): Promise<Record<string, number>> {
  const url =
    `${BASE}/marketing/v3/emails/statistics/list` +
    `?startTimestamp=${encodeURIComponent(startIso)}` +
    `&endTimestamp=${encodeURIComponent(endIso)}` +
    `&emailIds=${encodeURIComponent(emailId)}`;

  const res = await fetchWithTimeout(url, { headers: authHeaders() });
  if (!res.ok) return {};
  const json = await res.json();
  // Per-email totals are returned in aggregate.counters for the filtered id.
  return (json.aggregate?.counters ?? {}) as Record<string, number>;
}

/**
 * Lists marketing emails with per-email performance (by subject line).
 * Requires the `content` scope. Emails with no sends report zeros.
 */
export async function getEmailPerformance(limit = 100): Promise<EmailPerformance[]> {
  requireToken();

  const emails = await listMarketingEmails(limit);
  const startIso = new Date("2020-01-01").toISOString();
  const endIso = new Date().toISOString();

  const results = await mapWithConcurrency(emails, 6, async (email) => {
    const counters = await fetchEmailStats(email.id, startIso, endIso);
    const sent = num(counters.sent);
    const bounces = num(counters.bounce);
    const delivered = num(counters.delivered) || Math.max(sent - bounces, 0);
    const opens = num(counters.open);
    const clicks = num(counters.click);
    const denom = delivered > 0 ? delivered : sent;

    return {
      id: email.id,
      name: email.name,
      subject: email.subject || email.name || "(no subject)",
      state: email.state,
      sent,
      delivered,
      opens,
      clicks,
      bounces,
      openRate: denom > 0 ? opens / denom : 0,
      clickRate: denom > 0 ? clicks / denom : 0,
      bounceRate: sent > 0 ? bounces / sent : 0,
    } as EmailPerformance;
  });

  // Sort by sent volume so emails with activity surface first.
  return results.sort((a, b) => b.sent - a.sent);
}
