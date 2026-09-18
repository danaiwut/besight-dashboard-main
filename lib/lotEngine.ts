/** Canonical lot-qualification engine (client-safe, no Prisma import).
 *
 *  Single source of truth for HOW a member's lots are counted:
 *   - Standard window = the member's CURRENT monthly cycle anchored on the
 *     access start day (started Feb 10 → Feb 10–Mar 10, then Mar 10–Apr 10…).
 *     `entitlement` (whole access window) and `month` (calendar month) are
 *     view-only alternatives — qualification, snapshots and crons always use
 *     `cycle` unless an explicit period is requested.
 *   - Member total = the sum over EVERY trade account registered to the member
 *     with `status = active`, regardless of `verification` (verified/pending).
 *     Verification answers "has this account ever traded?" (per account);
 *     qualification answers "did this member trade enough this cycle?"
 *     (per member). Repeated tradeIds inside one member are de-duplicated so
 *     one set of trades can never count twice.
 *   - `selected_only` mode counts just the member's primary active account.
 *
 *  `lib/lotCycle.ts` re-exports this module for backward compatibility. */

export type LotCycle = { from: string; to: string };

/** Admin-selectable lot-check period. `cycle` is the qualification default. */
export type LotPeriod = "cycle" | "entitlement" | "month";

/** A resolved window plus its stable idempotency key (`from_to`). */
export type LotWindow = { from: string; to: string; period: string };

/** Lot counting mode. `sum_all_verified` is the legacy stored value and is
 *  treated exactly like `sum_all_active` everywhere (see normalizeCountMode). */
export type LotCountMode = "sum_all_active" | "selected_only";

export function normalizeCountMode(mode: unknown): LotCountMode {
  return mode === "selected_only" ? "selected_only" : "sum_all_active";
}

/** Add whole months to a YYYY-MM-DD date, clamping the day to the target
 *  month's length (Jan 31 + 1 month = Feb 28). */
export function addMonthsIso(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, 1));
  base.setUTCMonth(base.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(day, lastDay));
  return base.toISOString().slice(0, 10);
}

/** Whole months elapsed between a YYYY-MM-DD date and `to` (day-of-month aware). */
function fullMonthsBetween(fromIso: string, to: Date): number {
  const [year, month, day] = fromIso.split("-").map(Number);
  let months = (to.getUTCFullYear() - year) * 12 + (to.getUTCMonth() - (month - 1));
  if (to.getUTCDate() < day) months -= 1;
  return months;
}

/** The member's CURRENT monthly cycle, or null when no start date is known
 *  (callers fall back to the calendar month). */
export function currentLotCycle(
  input: { crmStartDate?: string; crmExpiryDate?: string },
  now = new Date(),
): LotCycle | null {
  const start = input.crmStartDate;
  if (!start) return null;
  const expiry = input.crmExpiryDate;
  const todayIso = now.toISOString().slice(0, 10);

  // Expired access: show the final cycle rather than an empty future one.
  if (expiry && todayIso >= expiry) {
    return { from: addMonthsIso(expiry, -1), to: expiry };
  }

  const elapsed = Math.max(0, fullMonthsBetween(start, now));
  const from = addMonthsIso(start, elapsed);
  let to = addMonthsIso(start, elapsed + 1);
  if (expiry && to > expiry) to = expiry;
  return { from, to };
}

/** Calendar-month fallback for members without CRM entitlement dates. */
export function currentMonthIso(now = new Date()): LotCycle {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** Resolves a period to a cycle. Returns null when the member has no usable
 *  dates so callers can fall back to the calendar month. */
export function lotWindowForPeriod(
  input: { crmStartDate?: string; crmExpiryDate?: string },
  period: LotPeriod,
  now = new Date(),
): LotCycle | null {
  if (period === "month") return currentMonthIso(now);
  if (period === "entitlement") {
    return input.crmStartDate && input.crmExpiryDate ? { from: input.crmStartDate, to: input.crmExpiryDate } : null;
  }
  return currentLotCycle(input, now);
}

/** Resolve + stamp a window: always returns a concrete window (falling back to
 *  the calendar month) together with its `from_to` idempotency key. */
export function resolveLotWindow(
  input: { crmStartDate?: string; crmExpiryDate?: string },
  period: LotPeriod = "cycle",
  now = new Date(),
): LotWindow {
  const cycle = lotWindowForPeriod(input, period, now) ?? currentMonthIso(now);
  return { from: cycle.from, to: cycle.to, period: `${cycle.from}_${cycle.to}` };
}

/** True when a persisted snapshot's stamped window matches the window being
 *  displayed — the ONLY condition under which the snapshot may be trusted. */
export function snapshotMatchesWindow(
  snapshot: { from?: string | null; to?: string | null },
  window: { from: string; to: string },
): boolean {
  return snapshot.from === window.from && snapshot.to === window.to;
}

/** De-duplicate tradeIds, keeping first-seen order. */
export function dedupeTradeIds(tradeIds: string[]): string[] {
  return [...new Set(tradeIds.map((id) => id.trim()).filter(Boolean))];
}

export type CountableAccount = { id: number; tradeId: string; status?: string };

/** Pick which accounts contribute to a member's total. Counts EVERY active
 *  account regardless of verification; repeated tradeIds count once (first
 *  account wins). `selected_only` counts just the primary active account. */
export function selectAccountsToCount(
  accounts: CountableAccount[],
  mode: LotCountMode | string,
  primaryAccountId?: number | null,
): CountableAccount[] {
  const active = accounts.filter((a) => (a.status ?? "active") === "active");
  if (normalizeCountMode(mode) === "selected_only") {
    const primary = active.find((a) => a.id === primaryAccountId) ?? [];
    return Array.isArray(primary) ? primary : [primary];
  }
  const seen = new Set<string>();
  return active.filter((a) => {
    const key = a.tradeId.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Qualification: lots >= required over the member's lot window. */
export function qualify(lots: number, required: number): boolean {
  return lots >= required;
}
