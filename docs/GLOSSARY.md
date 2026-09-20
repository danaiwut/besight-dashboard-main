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
| Renewal | Extending an access `expiresAt` from max(expiry, now) by `renewalMonths` after qualification. Recorded idempotently in `RenewalRecord` per (member, indicator, cycle period) with `origin` (`auto` = lot-check/cron, `manual` = admin Grant/Extend + attached cycle lots). Auto-grants run on the monthly cycle only; other check windows are view-only. |
| Lot check run | Audit of one lot query (`LotCheckRun` + `LotCheckResult` rows split by account/campaign/country/excluded-symbol). |
| Telegram access | `TelegramAccess`: one member+room grant (`active/pending/expired/banned`). Derived from member telegram fields during customer sync. |
| Activity | Customer-facing monthly trading competition shown on `/dashboard/activities` (`Activity` table; admin-managed in `/crm/activities`). `registered` mode: members enter with one of their own active XM/Exness accounts and are ranked by lot-check lots over the activity window. `demo_legacy`: pre-existing demo-only competitions — frozen (viewable, no new enrollments). Not to be confused with Activity log. |
| Activity log | Append-only `ActivityLog`; rows flagged `notification` feed the notification bell. Every admin action writes one (and bumps the data version). |
| Reward tier | One rung of the loyalty ladder (`RewardTier`, admin-managed in `/crm/reward-tiers`): lifetime lots threshold → reward. Members claim a tier once; each claim enters the fulfilment queue. |
| Competition prize | One `CompetitionPrize` row per activity (`rankFrom`–`rankTo` → award). The finalize step locks winners and creates one `RewardClaim` per winner. |
| Reward claim | One member reward to fulfil (`RewardClaim`: `tier` \| `competition` \| `manual`, `pending` → `fulfilled`/`cancelled`). Admins work a single queue (`/crm/reward-claims`); members track everything in `/dashboard/my-rewards`. |
| Journal account | One member's trading diary for one of their own registered trade accounts (`JournalAccount`; one journal per trade account). Holds hand-entered or MT4/MT5-imported `JournalTrade` rows plus a `RiskRule` — member-private, admins read-only via the member detail page. |
| Social link | A member-verified channel identity (`SocialAccount`: Telegram Login Widget, Discord OAuth2, LINE Login — real app logins, never hand-typed). Secrets in env, invite links in CRM settings; room access still follows indicator standing. |
| Acquisition channel | Where a member came from (`facebook/instagram/tiktok`, multi-select). |
| Customer stage | Lifecycle tag: `new` (never renewed) vs `existing` (renewed ≥ once), overridable per member. |
| Replace sync | Customer sync semantics: a non-empty upstream response replaces DB rows (stale members/accounts deleted); an empty response is rejected to protect data. |
| Backfill | Estimator (`backfillRebateData`) generating deterministic placeholder logs for display only — **never persisted** to the ledger. |
| Data version | Monotonic `crm_data_version` counter bumped on every server write; clients poll it for realtime refresh (see ADR-001). |
| Skeleton | Shimmer placeholder UI rendered while `crmDataStatus === "loading"`. |
| Access gate | **Removed.** Replaced by Auth.js per-user sign-in with admin/member roles. |
| Session | Stateless Auth.js JWT (`AUTH_SECRET`) carrying `{ role, memberId?, adminId? }`; identity is the underlying `Admin` or `Member` row. |
| Admin / Member role | `admin` may use the CRM (`/crm`, `/api/crm/*`); `member` sees only their own dashboard (`/dashboard`, `/api/me/*`). Enforced in layouts and per-route guards. |
| `/api/me` | Session-scoped endpoint returning the signed-in member's own data — never a query-param member id. |
| Identity check | Before a member can claim/add a trade account, they enter their TradingView username + email; both are compared (case-insensitive, `@`-tolerant) against the CRM-synced `Member` record. A match confirms the claimant knows the member's own CRM details (`/api/me/verify-identity`, re-enforced inside the trade-account endpoint). |
| Self-linked trade account | Trade accounts are never shown to a member until they claim them: a CRM-synced row starts `memberConfirmed = false` and stays hidden from the dashboard (as a "found on your behalf" pending item) until the member confirms it (identity check + `POST /api/me/trade-accounts`, which claims it) or enters the Trade ID themselves. Verified against the lot webhook, rejected (409) if the ID belongs to another member, and removable (`DELETE …/[id]`, own rows only). The CRM always sees every account regardless. |
| Mock fallback | **Removed.** The CRM no longer seeds sample rows: a failed read yields an empty collection plus a visible error, never fake data. |
