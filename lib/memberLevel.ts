/** Member level (customer standing) derived from monthly traded lots:
 *  - standard: traded >= the required bar this month
 *  - premium:  traded >= the bar in each of the last 3 consecutive months
 *  - basic:    below that
 *  Shared client/server helper (no Prisma import). */

export type MemberLevel = "basic" | "standard" | "premium";

export const MEMBER_LEVELS: MemberLevel[] = ["basic", "standard", "premium"];

export const MEMBER_LEVEL_ORDER: Record<MemberLevel, number> = { basic: 0, standard: 1, premium: 2 };

export const MEMBER_LEVEL_LABEL_KEYS: Record<MemberLevel, string> = {
  basic: "dash.level.basic",
  standard: "dash.level.standard",
  premium: "dash.level.premium",
};

/** Number of consecutive months a member must hit the bar for premium. */
export const PREMIUM_MONTHS = 3;

export function levelAtLeast(level: MemberLevel, required: MemberLevel): boolean {
  return MEMBER_LEVEL_ORDER[level] >= MEMBER_LEVEL_ORDER[required];
}

/** Month keys (YYYY-MM) newest first — ["2026-09","2026-08","2026-07"]. */
export function recentMonthKeys(count: number, now = new Date()): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return d.toISOString().slice(0, 7);
  });
}

/** Sums lots per YYYY-MM from trade-log-shaped rows. */
export function monthlyLotsFromLogs(
  logs: Array<{ tradeDate: string; lots: number }>,
  months: string[],
): Record<string, number> {
  const wanted = new Set(months);
  const monthly: Record<string, number> = {};
  for (const log of logs) {
    const key = log.tradeDate.slice(0, 7);
    if (!wanted.has(key)) continue;
    monthly[key] = (monthly[key] ?? 0) + log.lots;
  }
  return monthly;
}

/** basic / standard / premium for the given monthly totals and required bar. */
export function levelFromMonthlyLots(
  monthly: Record<string, number>,
  required: number,
  months: string[],
): MemberLevel {
  if (required > 0 && months.length >= PREMIUM_MONTHS && months.every((month) => (monthly[month] ?? 0) >= required)) {
    return "premium";
  }
  if (months.length && (monthly[months[0]] ?? 0) >= required && required > 0) return "standard";
  return "basic";
}
