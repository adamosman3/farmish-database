// Probe HubSpot API. Run: node scripts/test-hubspot.js
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TOKEN = process.env.HUBSPOT_TOKEN;
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

async function get(label, url) {
  try {
    const res = await fetch(url, { headers: H });
    const text = await res.text();
    console.log(`\n[${label}] ${res.status} ${res.statusText}`);
    console.log("  ", text.slice(0, 500));
    return { status: res.status, text };
  } catch (e) {
    console.log(`\n[${label}] ERROR: ${e.message}`);
    return { status: 0, text: "" };
  }
}

async function post(label, url, body) {
  try {
    const res = await fetch(url, { method: "POST", headers: H, body: JSON.stringify(body) });
    const text = await res.text();
    console.log(`\n[${label}] ${res.status} ${res.statusText}`);
    console.log("  ", text.slice(0, 400));
    return { status: res.status, text };
  } catch (e) {
    console.log(`\n[${label}] ERROR: ${e.message}`);
    return { status: 0, text: "" };
  }
}

async function main() {
  console.log("TOKEN present:", !!TOKEN);

  // Total counts via search
  await post("contacts count", "https://api.hubapi.com/crm/v3/objects/contacts/search", {
    filterGroups: [],
    limit: 1,
  });
  await post("companies count", "https://api.hubapi.com/crm/v3/objects/companies/search", {
    filterGroups: [],
    limit: 1,
  });

  // Contacts count + sample
  await get("contacts", "https://api.hubapi.com/crm/v3/objects/contacts?limit=2");

  // Companies count + sample
  await get("companies", "https://api.hubapi.com/crm/v3/objects/companies?limit=2");

  // Verify createdate filter works (should return a large number if valid)
  const since2025 = new Date("2025-01-01").getTime();
  await post("contacts since 2025-01-01", "https://api.hubapi.com/crm/v3/objects/contacts/search", {
    filterGroups: [{ filters: [{ propertyName: "createdate", operator: "GTE", value: String(since2025) }] }],
    limit: 1,
  });

  // Email statistics endpoint variants
  await get("emails stats (no params)", "https://api.hubapi.com/marketing/v3/emails/statistics/list");

  const start = new Date("2025-01-01").toISOString();
  const end = new Date().toISOString();
  await get(
    "emails stats (timestamps)",
    `https://api.hubapi.com/marketing/v3/emails/statistics/list?startTimestamp=${encodeURIComponent(start)}&endTimestamp=${encodeURIComponent(end)}`
  );

  // Full email list with names/subjects/state
  const listRes = await fetch(
    "https://api.hubapi.com/marketing/v3/emails?limit=20",
    { headers: H }
  );
  const listJson = await listRes.json();
  console.log(`\n[emails v3 list] count=${(listJson.results ?? []).length}`);
  for (const e of listJson.results ?? []) {
    console.log(`  id=${e.id} state=${e.state} name=${JSON.stringify(e.name)} subject=${JSON.stringify(e.subject)} publishDate=${e.publishDate}`);
  }

  // Wide-window statistics list
  const wideStart = new Date("2020-01-01").toISOString();
  const wideEnd = new Date("2027-01-01").toISOString();
  const statRes = await fetch(
    `https://api.hubapi.com/marketing/v3/emails/statistics/list?startTimestamp=${encodeURIComponent(wideStart)}&endTimestamp=${encodeURIComponent(wideEnd)}`,
    { headers: H }
  );
  const statJson = await statRes.json();
  console.log(`\n[emails stats wide] emails=${(statJson.emails ?? []).length}`);
  console.log("  aggregate.counters:", JSON.stringify(statJson.aggregate?.counters ?? {}));
  if ((statJson.emails ?? []).length) {
    console.log("  first email stat:", JSON.stringify(statJson.emails[0]).slice(0, 500));
  }

  const publishedId = "209597215340"; // Opt-in request (PUBLISHED)
  const automatedId = "211539878224"; // C-002 (AUTOMATED)

  // includeStats on email detail
  await get(
    "email detail includeStats (published)",
    `https://api.hubapi.com/marketing/v3/emails/${publishedId}?includeStats=true`
  );

  // statistics/list filtered by emailIds
  await get(
    "stats by emailId (automated)",
    `https://api.hubapi.com/marketing/v3/emails/statistics/list?startTimestamp=${encodeURIComponent(wideStart)}&endTimestamp=${encodeURIComponent(wideEnd)}&emailIds=${automatedId}`
  );
  await get(
    "stats by emailId (published)",
    `https://api.hubapi.com/marketing/v3/emails/statistics/list?startTimestamp=${encodeURIComponent(wideStart)}&endTimestamp=${encodeURIComponent(wideEnd)}&emailIds=${publishedId}`
  );
}

main();
