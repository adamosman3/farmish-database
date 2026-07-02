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

The app is deployed on [Fly.io](https://fly.io) as `farmish-admin-dashboard` in the **farmish** organization, at [admin-dashboard.getfarmish.com](https://admin-dashboard.getfarmish.com). It builds via the `Dockerfile` (Next.js standalone output) and is configured in `fly.toml`. Machines auto-stop when idle and auto-start on request.

Deploy with:

```bash
fly deploy
```

Environment variables are stored as Fly secrets (`fly secrets set NAME=value`): `POSTGRES_URL`, `HUBSPOT_TOKEN`, `AMPLITUDE_API_KEY`, and `AMPLITUDE_SECRET_KEY`.

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
