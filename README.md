# Farmish Database Dashboard

A Next.js web app that displays data from a Postgres database and Amplitude events in a dashboard layout.

## Features

- Postgres table overview with row counts and sample data
- Amplitude event analytics with timeline and event-type breakdown
- Responsive dashboard with charts and metric cards

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file with:
   ```
   POSTGRES_URL=your_postgres_connection_string
   AMPLITUDE_API_KEY=your_amplitude_api_key
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

## Deployment

This app is configured for Cloudflare Pages. For API routes that connect to Postgres, you may need to use a Postgres provider compatible with Cloudflare's edge runtime (e.g., Neon, Supabase) or deploy the API separately.

## Project Structure

- `app/page.tsx` — Main dashboard page
- `app/api/postgres/route.ts` — API route for Postgres data
- `app/api/amplitude/route.ts` — API route for Amplitude events
- `components/dashboard.tsx` — Dashboard layout and charts
- `lib/db.ts` — Postgres connection helper
- `lib/amplitude.ts` — Amplitude API client
