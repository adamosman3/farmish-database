// Test Amplitude API directly. Run: node scripts/test-amplitude.js
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const KEY = process.env.AMPLITUDE_API_KEY;
const SECRET = process.env.AMPLITUDE_SECRET_KEY;
const auth = "Basic " + Buffer.from(`${KEY}:${SECRET}`).toString("base64");

async function tryUrl(label, url) {
  try {
    const res = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" } });
    const text = await res.text();
    console.log(`\n[${label}] ${res.status} ${res.statusText}`);
    console.log("  URL:", url);
    console.log("  BODY:", text.slice(0, 400));
  } catch (e) {
    console.log(`\n[${label}] FETCH ERROR:`, e.message);
  }
}

async function main() {
  console.log("KEY present:", !!KEY, "SECRET present:", !!SECRET);

  // Current format used by the app (dashed dates)
  await tryUrl(
    "dashed dates",
    "https://amplitude.com/api/2/events/list?start=2026-06-30&end=2026-07-01&limit=100"
  );

  // Compact YYYYMMDD format
  await tryUrl(
    "compact dates",
    "https://amplitude.com/api/2/events/list?start=20260630&end=20260701&limit=100"
  );

  // events/list with no params (returns all event definitions)
  await tryUrl("no params", "https://amplitude.com/api/2/events/list");

  // 30-day window
  await tryUrl(
    "30-day window",
    "https://amplitude.com/api/2/events/list?start=20260601&end=20260701&limit=100"
  );

  // Segmentation: total active event volume, daily, last 30 days
  const e = encodeURIComponent(JSON.stringify({ event_type: "_active" }));
  await tryUrl(
    "segmentation _active totals",
    `https://amplitude.com/api/2/events/segmentation?e=${e}&start=20260601&end=20260701&m=totals&i=1`
  );

  // Count active (visible) event definitions
  const listRes = await fetch("https://amplitude.com/api/2/events/list", {
    headers: { Authorization: auth, Accept: "application/json" },
  });
  const listJson = await listRes.json();
  const active = (listJson.data ?? []).filter(
    (d) => !d.hidden && !d.deleted && !d.non_active
  );
  console.log(`\n[event defs] total=${(listJson.data ?? []).length} active=${active.length}`);
  console.log("  first active names:", active.slice(0, 12).map((d) => d.name));

  // Multi-event segmentation in one call
  const evs = active.slice(0, 3).map((d) => `e=${encodeURIComponent(JSON.stringify({ event_type: d.name }))}`).join("&");
  await tryUrl(
    "segmentation multi-event",
    `https://amplitude.com/api/2/events/segmentation?${evs}&start=20260601&end=20260701&m=totals&i=30`
  );
}

main();
