# BeSight CRM — Glossary

| Term | Meaning |
|---|---|
| Member | A trader/customer (`Member` table). Identified by `code` (`BS-0001`), synced from Supabase, holds plan, contact info and lot overrides. |
| Trade account / Trade ID | One MT login (`TradeAccount.tradeId`) belonging to a member at a broker. Has verification (`verified/pending/not_found`) and status (`active/inactive`). |
| Broker | Trading broker (`Broker`: XM, Exness…). Trade accounts reference it; partner IB codes live on the account. |
| Trade log | Ledger row (`TradeLog`): one account/day snapshot (`symbol "ALL"`) written by the trade-log-snapshot cron — the single place lot numbers are stored. |
| Lots | Traded volume. **Current-period lots** prefer the persisted `Member.currentPeriodLots` (member-lots-snapshot cron) — but only when its stamped `currentPeriodLotsFrom/To` window matches the member's current qualification window; on a window miss the UI falls back to window-correct ledger math. Lifetime sums come from trade logs. |
| Required lots | Monthly qualification bar: global `Settings.requiredLots` (default 3) unless a member-level `requiredLotsOverride` exists. |
| Qualification | `lots >= required` over the member's lot window (CRM entitlement dates, else current month). |
| Indicator | A TradingView product (`Indicator`, e.g. BeSight One STR) gated by access expiry. |
| Indicator access | `MemberIndicatorAccess`: one member+indicator grant, lifecycle `pending → active → expired`, plus `suspended` (manual) and `manualLock` (automation must not touch). `source` records who granted it: `Broker | Admin | SpecialAccess | Plan`. |
| Plan / Entitlement | `Plan` (`free | ib_partner`) → which Indicators it unlocks (`PlanIndicatorEntitlement`). Drives auto-grant. |
| Renewal | Extending an access `expiresAt` by `renewalMonths` after qualification. Recorded idempotently in `RenewalRecord` per (member, indicator, period). |
| Lot check run | Audit of one lot query (`LotCheckRun` + `LotCheckResult` rows split by account/campaign/country/excluded-symbol). |
| Telegram access | `TelegramAccess`: one member+room grant (`active/pending/expired/banned`). Derived from member telegram fields during customer sync. |
| Activity log | Append-only `ActivityLog`; rows flagged `notification` feed the notification bell. Every admin action writes one (and bumps the data version). |
| Acquisition channel | Where a member came from (`facebook/instagram/tiktok`, multi-select). |
| Customer stage | Lifecycle tag: `new` (never renewed) vs `existing` (renewed ≥ once), overridable per member. |
| Replace sync | Customer sync semantics: a non-empty upstream response replaces DB rows (stale members/accounts deleted); an empty response is rejected to protect data. |
| Backfill | Estimator (`backfillRebateData`) generating deterministic placeholder logs for display only — **never persisted** to the ledger. |
| Data version | Monotonic `crm_data_version` counter bumped on every server write; clients poll it for realtime refresh (see ADR-001). |
| Skeleton | Shimmer placeholder UI rendered while `crmDataStatus === "loading"`. |
