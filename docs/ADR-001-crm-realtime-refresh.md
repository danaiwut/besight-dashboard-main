# ADR-001: CRM realtime refresh via version counter

Status: accepted · Date: 2026-09-16

## Context

The CRM (`/crm/*`) is a multi-admin tool whose data changes from several writers:
admin mutations in the UI, the Supabase customer replace-sync, the lot-renewal and
snapshot crons, and the lot-check automation. Previously the UI only loaded data on
mount (plus a manual re-sync button), so new data required a full page refresh.
The store is MariaDB (no `LISTEN/NOTIFY`-style push), hosted on Vercel serverless.

## Decision

**Monotonic version-counter polling ("realtime pull"):**

- One `SystemSetting` row, key `crm_data_version`, holds an integer counter.
- Every server-side write path atomically increments it
  (`lib/server/dataVersion.ts bumpDataVersion()` — single-statement
  `INSERT … ON DUPLICATE KEY UPDATE`, so concurrent writers can't lose a bump).
- `GET /api/crm/version` returns `{ ok: true, version }` (cheap single-row read,
  `0` when uninitialized).
- `CrmProvider` polls it every ~10s (skipped while the tab is hidden) and on
  `visibilitychange` → visible; when the version moves it re-reads **all datasets
  from DB-read endpoints** (never re-triggers the slow upstream Supabase sync)
  and applies them with the same hydration rules as initial load
  (mock fallbacks preserved). The current version is exposed as `dataVersion`
  so detail views (e.g. renewal history) can refetch too.

## Alternatives considered

- **Fixed-interval full refetch** — simpler, but re-pulls megabytes of members/logs
  every cycle even when nothing changed; discarded as wasteful.
- **SSE/WebSocket push** — true push, but needs persistent connections (awkward on
  Vercel serverless) and a change-detection source the server doesn't have
  (writers are external processes). Discarded as over-engineering for an admin UI
  where ~10s freshness is plenty.

## Consequences

- Admins see each other's changes and cron results within ~10s, no manual refresh.
- Refetch is full-state replace (server wins); ephemeral local-only rows
  (e.g. the rebate-backfill estimator, which deliberately never persists fake
  ledger rows) are discarded on the next reload — documented in code.
- `log()` (activity feed) POSTs bump the version, so any admin action — even a
  local-only one — triggers a harmless idempotent reload.
- Superseded: CRM routes are no longer unauthenticated. Every `/api/crm` handler
  (the version endpoint included) calls an admin guard from `lib/session.ts`, so
  the poll only runs for a signed-in admin. Cron endpoints authenticate with
  `CRON_SECRET` via `cronGuard` instead of a session.
