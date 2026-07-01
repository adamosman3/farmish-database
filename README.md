# Farmish Database Dashboard

A Next.js (App Router) dashboard that unifies live data from **Postgres**, **Amplitude**, and **HubSpot** into one place, with build-your-own custom widgets.

## Features

- **Listings analytics** — totals, daily trend, top locations, category/state breakdowns
- **Messaging & user analytics** — message volume, conversations, signups, active users, paying users, subscription/state breakdowns
- **HubSpot analytics** — contacts, companies, and marketing emails, plus a HubSpot custom dashboard builder
- **Amplitude event analytics** — event volume timeline and top event types
- **Postgres overview** — table row counts and sample data
- **Build Your Own Dashboard** — pick a group, metric, breakdown, and time range to create custom widgets (Postgres + HubSpot), saved in the browser
- Responsive UI with Recharts charts, metric cards, and Tailwind CSS

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create your environment file by copying the example and filling in real values:
   ```bash
   cp .env.example .env.local
   ```

   Required variables (see `.env.example`):
   ```
   POSTGRES_URL=postgres://user:password@host:5432/dbname
   AMPLITUDE_API_KEY=your_amplitude_api_key
   AMPLITUDE_SECRET_KEY=your_amplitude_secret_key
   HUBSPOT_TOKEN=your_hubspot_private_app_token
   ```

   > `.env.local` is gitignored and must never be committed.

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

## Deployment

The app uses the Node `pg` driver with a long-lived connection pool (`lib/db.ts`). To deploy on Cloudflare's edge runtime, either use a Postgres provider with a serverless HTTP driver (e.g. Neon) or place Cloudflare Hyperdrive in front of the database. Amplitude and HubSpot calls are plain `fetch` and work on the edge as-is. Alternatively, host on any Node platform and put Cloudflare in front for DNS/CDN.

## Project Structure

```
app/
  page.tsx                     Main dashboard page
  api/
    postgres/route.ts          Postgres table overview
    listings/route.ts          Listings analytics
    analytics/route.ts         Messaging & user analytics
    amplitude/route.ts         Amplitude events
    custom/route.ts            Postgres custom-metrics catalog + query
    hubspot/
      contacts|companies|emails/route.ts   HubSpot object summaries
      custom/route.ts          HubSpot custom-metrics catalog + query
components/                    Dashboard sections, charts, cards, builders
lib/
  db.ts                        Postgres connection helper
  amplitude.ts                 Amplitude API client
  hubspot.ts                   HubSpot API client
  analytics.ts                 Messaging & user queries
  listings.ts                  Listings queries
  custom-metrics.ts            Postgres custom-metrics catalog + engine
  hubspot-custom.ts            HubSpot custom-metrics catalog + engine
scripts/                       Diagnostic scripts (read from .env.local)
```
