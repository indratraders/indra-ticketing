# Indra Traders — Test Drive Token Ticketing System

Production-quality showroom queue management for **Indra Traders (PVT) LTD**.

Repository: [https://github.com/indratraders/indra-ticketing](https://github.com/indratraders/indra-ticketing)

## Features

- Token issuing (Officer 1) at `/tokens`
- Queue control (Officer 2) at `/queue`
- Public TV display at `/display` (optional `?counter=1`)
- Role-based login: Admin / Token Officer / Queue Officer
- Real-time sync via Server-Sent Events + polling fallback
- History, reports, vehicles, settings
- SQL Server in production, optional in-memory demo mode for development

## Quick Start

```bash
git clone https://github.com/indratraders/indra-ticketing.git
cd indra-ticketing
npm install
cp .env.example .env.local
```

Edit `.env.local` with your SQL Server host, user, and password. Then:

```bash
npm run db:prepare
npm run db:health
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Demo credentials (DEVELOPMENT ONLY)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@indra.local | demo1234 |
| Token Officer | token@indra.local | demo1234 |
| Queue Officer | queue@indra.local | demo1234 |

## Deploy on the SQL Server machine

1. Install Node.js 20+ on the Windows server that hosts (or can reach) SQL Server.
2. Clone this repo on the server and copy `.env.example` to `.env`:

```bash
git clone https://github.com/indratraders/indra-ticketing.git
cd indra-ticketing
copy .env.example .env
```

3. Set these values in `.env` (never commit this file):

| Variable | Typical value on the DB server |
|----------|--------------------------------|
| `NEXT_PUBLIC_ENABLE_DEMO_MODE` | `false` |
| `DB_SERVER` | `localhost` (or the LAN IP / host name) |
| `DB_PORT` | `1433` |
| `DB_USER` / `DB_PASSWORD` | SQL authentication account |
| `DB_NAME` | `indra_ticketing` |
| `DB_ENCRYPT` | `false` for on-prem SQL Server |
| `COOKIE_SECURE` | `false` if the site is HTTP on the LAN |
| `NEXTAUTH_SECRET` | a long random string |

4. SQL Server must allow **SQL authentication** (mixed mode) and **TCP port 1433**.
5. Create the database, tables, and seed users, then build and start:

```bash
npm install
npm run db:prepare
npm run db:health
npm run build
npm start
```

6. Confirm SQL Server from a browser: `http://<server>:3000/api/health` should return `"mode":"sqlserver"` and `"ok":true`.

If the app is on a **different machine** than SQL Server, set `DB_SERVER` to that server’s LAN IP or host name and open TCP 1433 between them.

## Vercel

Vercel cannot see the office SQL Server. The live site must use **Supabase Postgres** (or Redis) so tokens are not lost between requests:

1. Connect Supabase to the Vercel project (Storage / Marketplace) — this sets `POSTGRES_URL`
2. Create the store table once:

```bash
npx vercel env pull .env.local
npm run db:supabase
```

Or paste and run `scripts/setup-supabase.sql` in the Supabase SQL editor.

3. Redeploy

`/api/health` should show `"mode":"durable"` and `"backend":"supabase"`. Without that, each serverless instance has its own queue, so tokens appear, disappear, and repeat.

## Architecture

```
UI → API routes → Services → Repositories → SQL Server (mssql) / demo store
```

Repositories live in `src/lib/repositories/`. SQL Server implementations are in `src/lib/repositories/mssql/`.

## Key Routes

| Route | Purpose |
|-------|---------|
| `/login` | Authentication |
| `/tokens` | Issue tokens |
| `/queue` | Queue control |
| `/display` | Public TV screen |
| `/history` | Token history |
| `/reports` | Reports & charts |
| `/vehicles` | Vehicle management |
| `/settings` | System settings |
| `/admin` | Admin dashboard |
| `/api/health` | Database connectivity check |

## Real-time

`useQueueState()` / `useRealtimeQueue()` subscribe to `/api/realtime` (SSE) and fall back to polling. Replace the transport later without rewriting pages.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · SQL Server (`mssql`) · Zod · Jose · Recharts · Lucide
