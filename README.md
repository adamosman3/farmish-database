# Farmish Database Dashboard

A Next.js (App Router) dashboard that unifies live data from **Postgres**, **Amplitude**, and **HubSpot** into one place, with build-your-own custom widgets.

## Features

- **Listings analytics** — totals, daily trend, top locations, category/state breakdowns
- **Messaging & user analytics** — message volume, conversations, signups, active users, paying users, subscription/state breakdowns
- **HubSpot analytics** — contacts, companies, and marketing emails, plus a HubSpot custom dashboard builder
- **Amplitude event analytics** — event volume timeline and top event types
- **Postgres overview** — table row counts and sample data
- **Build Your Own Dashboard** — pick a group, metric, breakdown, and time range to create custom widgets (Postgres + HubSpot), saved in the browser
- **Admin-only login** — OAuth2 sign-in against the Farmish app (Doorkeeper); only Farmish admins get access
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
   FARMISH_URL=http://localhost:3000
   FARMISH_CLIENT_ID=your_doorkeeper_application_uid
   FARMISH_CLIENT_SECRET=your_doorkeeper_application_secret
   APP_URL=http://localhost:3001
   SESSION_SECRET=random_string_of_at_least_32_chars
   ```

   > `.env.local` is gitignored and must never be committed.

3. Run the development server (on 3001 so Farmish can keep 3000):
   ```bash
   npm run dev -- -p 3001
   ```

4. Open [http://localhost:3001](http://localhost:3001).

## Authentication

The whole app — pages and API routes — sits behind an OAuth2 login against the Farmish Rails app (Doorkeeper), using the authorization-code flow with PKCE. Only users whose Farmish account has `admin: true` are allowed in; everyone else is bounced back to the login page.

One-time setup on the Farmish side:

1. Register an OAuth application at `<farmish>/oauth/applications` (or via console):
   - Redirect URI: `<APP_URL>/api/auth/callback` (one per environment)
   - Scopes: `public`, Confidential: yes
   Copy the UID/secret into `FARMISH_CLIENT_ID` / `FARMISH_CLIENT_SECRET`.
2. Expose the admin flag in `GET /api/me` (`API::UsersController`) by adding `admin: current_resource_owner.admin?` to the JSON. Until that field is present, all sign-ins are rejected as non-admin — the safe default.

How it works here:

- `middleware.ts` guards every route: unauthenticated page requests redirect to `/login`, unauthenticated API requests get a 401. Only `/login` and the OAuth endpoints are public.
- `/api/auth/login` starts the flow (state + PKCE), `/api/auth/callback` exchanges the code, fetches `/api/me`, and rejects non-admins, `/api/auth/logout` revokes the token and clears the session.
- The session lives in an encrypted, httpOnly cookie (`iron-session`) with a 2-hour TTL matching Farmish's access-token life. Re-authentication after expiry is invisible for users still signed into Farmish, and a revoked admin loses access within 2 hours.

## Deployment

The app uses the Node `pg` driver with a long-lived connection pool (`lib/db.ts`). To deploy on Cloudflare's edge runtime, either use a Postgres provider with a serverless HTTP driver (e.g. Neon) or place Cloudflare Hyperdrive in front of the database. Amplitude and HubSpot calls are plain `fetch` and work on the edge as-is. Alternatively, host on any Node platform and put Cloudflare in front for DNS/CDN.

## Project Structure

```
middleware.ts                  Auth guard for all pages and API routes
app/
  page.tsx                     Main dashboard page
  login/page.tsx               Sign-in page (with error states)
  api/
    auth/
      login|callback|logout/route.ts       OAuth2 flow against Farmish
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
  session.ts                   Session shape + iron-session config (edge-safe)
  auth.ts                      getSession() helper for server components/routes
  oauth.ts                     OAuth2/PKCE client for Farmish Doorkeeper
  db.ts                        Postgres connection helper
  amplitude.ts                 Amplitude API client
  hubspot.ts                   HubSpot API client
  analytics.ts                 Messaging & user queries
  listings.ts                  Listings queries
  custom-metrics.ts            Postgres custom-metrics catalog + engine
  hubspot-custom.ts            HubSpot custom-metrics catalog + engine
scripts/                       Diagnostic scripts (read from .env.local)
```
