# BeSight Dashboard — Project Overview

Next.js 16 (App Router) + React 19 + Prisma 7 + MariaDB. An internal **Member CRM** for
managing BeSight traders, trade accounts, TradingView Indicator access and Telegram access,
plus a demo customer-facing dashboard. Member data is synchronized from an existing
Supabase Edge Function; lot qualification comes from the BeSight webhook service.

## Authentication (Auth.js / NextAuth v5)

- **Identity lives in Prisma** — signing in claims an existing `Admin` or
  `Member` row by email; it never creates one (members are provisioned by the
  CRM sync). No separate user store, no `Session`/`Account` tables: sessions are
  stateless JWTs (`AUTH_SECRET`).
- **Providers:** Google, Facebook and LINE (each registered only when its
  client id/secret are present; LINE via its OpenID Connect endpoint) plus
  email/password (scrypt via `node:crypto`; `Admin.passwordHash` /
  `Member.passwordHash`). Seed creates the owner admin
  (`admin@besight.com` unless `ADMIN_EMAIL`/`ADMIN_PASSWORD` override).
  **Currently on hold:** Facebook + LINE are disabled by commenting their env
  values in `.env` (code intact) — only Google + credentials are active.
- **Roles:** `admin` (CRM) and `member` (dashboard). `/crm/**` requires admin,
  `/dashboard/**` requires a signed-in member (or admin); the root page
  redirects by role; unauthenticated pages redirect to `/login`.
- **API protection is defence-in-depth, not middleware:** every handler calls
  `adminGuard()` / `memberGuard()` (`lib/session.ts`) — admins use `/api/crm/*`,
  members use `/api/me/*` (their own rows only, resolved from the session, never
  a query param). A member calling `/api/crm/*` gets 403.
- Config env: `AUTH_SECRET`, `AUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`,
  `FACEBOOK_CLIENT_ID/SECRET`, `LINE_CLIENT_ID/SECRET`. Redirect URIs:
  `<AUTH_URL>/api/auth/callback/{google,facebook,line}`.
- **No mock fallback:** a failed/401 read leaves the collection empty and surfaces
  `crmDataError` via `<DataUnavailable>`; the CRM seeds nothing.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2 (App Router, `trailingSlash: true`) |
| UI | React 19, custom CSS (`styles/tokens.css`, `crm.css`, `dashboard.css`, `auth.css`) — no component library |
| DB / ORM | MariaDB via Prisma 7 (`mysql` provider, `@prisma/adapter-mariadb`), client in `generated/prisma` |
| Language | TypeScript (strict-ish), ESLint 9 |
| Runtime extras | `hls.js` (dashboard video), Vercel Cron (`vercel.json`) |
| Auth | Demo-only: `localStorage` keys (`dts_tv`, `dts_email`, `dts_registered`) — no real session yet |

## Repository layout

```
app/
  (auth)/login|signup        # demo auth pages
  crm/                       # admin CRM (Overview, Members, Brokers, Indicators,
                             #   Campaigns, Telegram Access, Activity Logs, Settings)
  dashboard/                 # customer-facing demo (activities, courses, journal,
                             #   leaderboard, rewards, spin-wheel, vip, profile…)
  api/crm/*/route.ts         # CRM REST endpoints (members, brokers, indicators,
                             #   access, telegram, admins, settings, lot-check…)
  api/cron/*/route.ts        # scheduled jobs (lot-renewals, snapshots)
components/crm/              # CRM UI: CrmContext (global store), forms, panels, skeletons
components/dashboard/        # customer dashboard chrome
components/auth/             # login/signup views
lib/server/                  # server-only: prisma, customerSync, lotCheck,
                             #   indicatorAutomation, tradeLogSync, memberLotsSync,
                             #   indicatorSettings, dataVersion
lib/                         # shared: i18n (en/th), csvImport, exportCsv, journal…
prisma/schema.prisma         # 15 models (see Data model)
prisma/seed.ts               # brokers (XM/Exness), indicators, plan entitlements, automation defaults
styles/                      # tokens + per-zone CSS
docs/                        # ADR + glossary (see docs/GLOSSARY.md)
```

## Two app zones

- **`/crm/*` (admin CRM).** All state flows through `CrmProvider`
  (`components/crm/CrmContext.tsx`). On mount it hydrates every resource from the
  backend (`/api/crm/*`) in parallel, exposes `crmDataStatus: "loading" | "ready"`,
  and pages render shimmer **skeletons** (`components/crm/Skeletons.tsx`) until ready.
  Writes go through REST endpoints and persist to MariaDB. A `crm_data_version`
  counter drives **realtime refresh**: the provider polls `GET /api/crm/version`
  every ~10s (and on tab focus) and re-reads all datasets when the version moves
  (see `docs/ADR-001-crm-realtime-refresh.md`).
- **`/dashboard/*` (customer demo).** Reads the same `CrmContext` store but is a
  showcase frontend (courses, journal, leaderboard…); demoed as member id 1.

## Data model (Prisma)

Core chain: **Member 1:N TradeAccount** (each linked to a **Broker**) → **TradeLog**
ledger (one row per account/day from the snapshot cron) → **lot qualification** →
**MemberIndicatorAccess** (per member+indicator, lifecycle `pending/active/suspended/expired`)
governed by **PlanIndicatorEntitlement** (which plan unlocks which **Indicator**).
Supporting tables: **RenewalRecord** (one row per member/indicator/period — idempotency key),
**LotCheckRun/Result** (audit of every lot query), **TelegramAccess**, **ActivityLog**
(doubles as the notification feed), **MemberAcquisitionChannel**, **Admin**,
**SystemSetting** (automation config, general settings, data version).
**Activity** holds the customer-facing activities/competitions shown on
`/dashboard/activities` (title, status, dates, traders, prize pool, rules,
published flag) and is managed from **`/crm/activities`** — distinct from
`ActivityLog`, which is the admin audit trail.

Enums: `Plan (free|ib_partner)`, `RecordStatus`, `VerificationStatus`,
`IndicatorAccessStatus`, `AccessSource (Broker|Admin|SpecialAccess|Plan)`,
`TelegramStatus`, `CustomerStage`, `LotCheckKind`.

## Key flows

1. **Customer sync** (`GET|POST /api/crm/customers/sync` → `lib/server/customerSync.ts`).
   Paginated pull from the Supabase `crm-customers` Edge Function (**replace sync**:
   members/accounts absent from a non-empty response are deleted; an empty response
   is rejected and never wipes data). Also upserts Brokers, Indicator access from the
   CRM payload, and derives **TelegramAccess** rows from member telegram fields.
   Bumps the data version.
2. **Lot checking** (`/api/crm/lot-check` → `lib/server/lotCheck.ts`). Proxies the
   BeSight webhook (`LOT_CHECK_BASE_URL`, 4 paths: account/campaign/country/
   excluded-symbol) over a `YYYY-MM-DD` window; empty body = genuine zero.
3. **Indicator automation** (`persistLotCheckAndAutomate`). If a linked member's lots
   ≥ required (`DEFAULT_REQUIRED_LOTS=3` unless member override), grants/renews the
   member's plan-entitled active Indicators. Idempotent per (member, indicator,
   period); never touches `manualLock`/`suspended` records; writes `RenewalRecord` +
   `ActivityLog`.
4. **Crons** (`vercel.json`, all `Bearer CRON_SECRET`): `lot-renewals` daily 01:00
   (re-check due access, extend on qualification), `trade-log-snapshot` 00:30
   (one `TradeLog` row per verified account/day, prune >3 months),
   `member-lots-snapshot` every 4h (persist `Member.currentPeriodLots` **with its
   window stamp**, which list views prefer over live computation; the customer
   sync recomputes members whose window just changed, and any member can be
   refreshed on demand via `POST /api/crm/members/[id]/lots/refresh`). Each bumps the data version on success.

## API routes reference

| Route | Methods | Purpose |
|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | Auth.js sign-in/callback/session/sign-out |
| `/api/me` | GET | Signed-in member's own dashboard payload (session-scoped) |
| `/api/me/verify-identity` | POST | Member proves they are the CRM record (TradingView + email must match) |
| `/api/me/trade-accounts` | POST | Member links / confirms a Trade ID (identity-checked; `claimed` when a CRM-synced row is claimed; 409 if another member's) |
| `/api/me/trade-accounts/[id]` | DELETE | Member unlinks one of their own trade accounts (403 for someone else's) |
| `/api/crm/version` | GET | Realtime counter `{ version }` (admin) |
| `/api/crm/members` (+`/[id]`) | GET/POST, PUT/DELETE | Member CRUD (GET reads DB DTOs incl. channels/plan/overrides) |
| `/api/crm/customers/sync` | GET/POST | Upstream Supabase replace-sync |
| `/api/crm/trade-accounts` (+`/[id]`) | POST, PUT/DELETE | Trade account CRUD |
| `/api/crm/trade-accounts/verify` | POST | Real Trade ID check against the lot webhook (12-month lookback); `accountId` optional to persist the outcome |
| `/api/crm/brokers` (+`/[id]`) | GET/POST, PUT/DELETE | Broker CRUD |
| `/api/crm/indicators` (+`/[id]`) | GET/POST, PUT/DELETE | Indicators + access + plan entitlements (GET) |
| `/api/crm/activities` (+`/[id]`) | GET/POST, PUT/DELETE | Admin CRUD for customer activities/competitions |
| `/api/activities` (+`/[slug]`) | GET | Customer-facing published activities / one by slug |
| `/api/crm/indicator-access` (+`/[id]`) | POST, PATCH | Grant / extend / suspend / revoke access |
| `/api/crm/renewal-history` | GET `?memberId=` | Grant/renew audit per member |
| `/api/crm/telegram-access` (+`/[id]`) | GET, PATCH | Telegram access list / status change |
| `/api/crm/admins` (+`/[id]`) | GET/POST, PUT/DELETE | Team CRUD (owner row protected, no password hashes leak) |
| `/api/crm/trade-logs` | GET `?tradeAccountId=` or bulk | Ledger rows (bulk = last 3 months, cap 5000) |
| `/api/crm/lot-check` | GET/POST | Webhook proxy (+ optional auto-grant automation) |
| `/api/crm/activity-logs` | GET/POST/PATCH | Activity + notification feed (POST also bumps version) |
| `/api/crm/notifications` | GET | Latest 30 notification-shaped log rows |
| `/api/crm/settings/indicator-automation` | GET/PUT | `{ requiredLots, renewalMonths, enabled }` |
| `/api/crm/settings/plan-entitlements` | PUT | Plan → indicator mapping |
| `/api/crm/settings/general` | GET/PUT | Telegram bot/room/auto-remove, expiring window, lot-calc mode |
| `/api/cron/*` | GET (auth) | Scheduled jobs above |

All CRM routes return `{ ok: true, … }` or `{ ok: false, error }` (503 when
`DATABASE_URL` is missing). There is no per-user auth on CRM routes yet.

## Environment variables

`DATABASE_URL`, `SHADOW_DATABASE_URL` (migrate dev only), `CRM_CUSTOMERS_URL/TOKEN`
(server-only, never `NEXT_PUBLIC_`), `LOT_CHECK_BASE_URL`, `DEFAULT_REQUIRED_LOTS` (3),
`INDICATOR_RENEWAL_MONTHS` (1), `CRON_SECRET`. See `.env.example`.

## Local setup

```bash
npm run db:generate
npm run db:migrate -- --name <name>   # needs SHADOW_DATABASE_URL
npm run db:seed
npm run dev
```

CRM: `http://localhost:3000/crm/members` · Campaigns/lot check: `/crm/campaigns`.
Key scripts: `dev|build|start|lint`, `db:generate|db:migrate|db:deploy|db:seed|db:studio`.
