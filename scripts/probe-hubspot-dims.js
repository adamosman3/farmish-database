// Probe feasibility of HubSpot breakdowns. Run: node scripts/probe-hubspot-dims.js
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

async function searchCount(objectType, filters) {
  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/search`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ filterGroups: filters ? [{ filters }] : [], limit: 1 }),
  });
  const j = await res.json();
  return j.total ?? `ERR ${res.status}`;
}

async function propertyOptions(objectType, prop) {
  const res = await fetch(`https://api.hubapi.com/crm/v3/properties/${objectType}/${prop}`, { headers: H });
  if (!res.ok) return `ERR ${res.status}`;
  const j = await res.json();
  return (j.options ?? []).map((o) => ({ label: o.label, value: o.value }));
}

async function main() {
  // Time-series feasibility: contacts created in a month window
  const start = new Date("2026-06-01").getTime();
  const end = new Date("2026-07-01").getTime();
  const monthCount = await searchCount("contacts", [
    { propertyName: "createdate", operator: "GTE", value: String(start) },
    { propertyName: "createdate", operator: "LT", value: String(end) },
  ]);
  console.log("Contacts created June 2026:", monthCount);

  // lifecyclestage options
  const lc = await propertyOptions("contacts", "lifecyclestage");
  console.log("\nContact lifecyclestage options:", Array.isArray(lc) ? lc.length : lc);
  if (Array.isArray(lc)) {
    for (const o of lc.slice(0, 12)) {
      const c = await searchCount("contacts", [{ propertyName: "lifecyclestage", operator: "EQ", value: o.value }]);
      console.log(`  ${o.label} (${o.value}): ${c}`);
    }
  }

  // company lifecyclestage
  const clc = await propertyOptions("companies", "lifecyclestage");
  console.log("\nCompany lifecyclestage options:", Array.isArray(clc) ? clc.length : clc);

  // contact lead status
  const ls = await propertyOptions("contacts", "hs_lead_status");
  console.log("Contact hs_lead_status options:", Array.isArray(ls) ? ls.length : ls);
}

main().catch((e) => console.error("ERR", e.message));
