/** Shared data for the Activities (monthly trading competitions) feature —
 *  used by both the list page and the competition detail sub-page. */

export type CompStatus = "upcoming" | "live" | "finished";

export type Competition = {
  key: string;
  status: CompStatus;
  month: number; // 1-12, for the "{month} Competition '{year}" title + common.month.N lookup
  year: number;
  rangeStart: string; // ISO — enrollment/competition window shown on the ribbon
  rangeEnd: string;
  traders: number;
};

export const COMPETITIONS: Competition[] = [
  { key: "2026-10", status: "upcoming", month: 10, year: 2026, rangeStart: "2026-10-01", rangeEnd: "2026-10-14", traders: 86 },
  { key: "2026-09", status: "live", month: 9, year: 2026, rangeStart: "2026-09-01", rangeEnd: "2026-09-30", traders: 142 },
  { key: "2026-08", status: "finished", month: 8, year: 2026, rangeStart: "2026-08-01", rangeEnd: "2026-08-31", traders: 131 },
  { key: "2026-07", status: "finished", month: 7, year: 2026, rangeStart: "2026-07-01", rangeEnd: "2026-07-31", traders: 118 },
  { key: "2026-06", status: "finished", month: 6, year: 2026, rangeStart: "2026-06-01", rangeEnd: "2026-06-30", traders: 104 },
  { key: "2026-05", status: "finished", month: 5, year: 2026, rangeStart: "2026-05-01", rangeEnd: "2026-05-31", traders: 95 },
  { key: "2026-04", status: "finished", month: 4, year: 2026, rangeStart: "2026-04-01", rangeEnd: "2026-04-30", traders: 88 },
  { key: "2026-03", status: "finished", month: 3, year: 2026, rangeStart: "2026-03-01", rangeEnd: "2026-03-31", traders: 76 },
];

export function competitionByKey(key: string) {
  return COMPETITIONS.find((c) => c.key === key);
}

/** Same $2,000 / Top-20 prize pool for every competition (see dash.activities.prizeText) — modeled as a shared tiered breakdown rather than per-competition data. */
export const PRIZE_POOL = 2000;

export const PRIZE_TIERS: { rankKey: string; amount: number }[] = [
  { rankKey: "1", amount: 500 },
  { rankKey: "2", amount: 350 },
  { rankKey: "3", amount: 250 },
  { rankKey: "4-10", amount: 100 },
  { rankKey: "11-20", amount: 20 },
];

export const RULE_KEYS = [
  "dash.activity.rule.1",
  "dash.activity.rule.2",
  "dash.activity.rule.3",
  "dash.activity.rule.4",
  "dash.activity.rule.5",
  "dash.activity.rule.6",
];

/** Prize amount for a given standing (1-20), or null outside the paying tiers. */
export function prizeForRank(rank: number): number | null {
  if (rank === 1) return 500;
  if (rank === 2) return 350;
  if (rank === 3) return 250;
  if (rank >= 4 && rank <= 10) return 100;
  if (rank >= 11 && rank <= 20) return 20;
  return null;
}

/** memberId is null for a standing beyond the 10 real demo members — the
 *  roster only has 10 seeded members, so ranks 11-20 fall back to an
 *  anonymized "Trader #{rank}" placeholder rather than reusing a real name twice. */
export type ActivityLeaderboardRow = { rank: number; memberId: number | null; lots: number };

// The 10 demo members shared with CrmContext (ids 1-10) — rotated by the
// competition's month so each competition shows a different top-of-list
// rather than the exact same ranking every time, without any per-competition
// data of its own (there's no real per-trade history for these mock events,
// see lib/journal.ts for that pattern elsewhere).
const DEMO_MEMBER_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Deterministic standings for a competition, one row per paying tier (up
 *  to the Top 20 — see PRIZE_TIERS) capped at the competition's own trader
 *  count. Empty for "upcoming" competitions, since nobody has traded yet. */
export function competitionLeaderboard(c: Competition): ActivityLeaderboardRow[] {
  if (c.status === "upcoming") return [];
  const totalRows = Math.min(20, c.traders);
  if (totalRows <= 0) return [];
  const offset = c.month % DEMO_MEMBER_IDS.length;
  const rotated = [...DEMO_MEMBER_IDS.slice(offset), ...DEMO_MEMBER_IDS.slice(0, offset)];
  const base = Math.max(24, Math.round(c.traders / 5));
  const step = base / (totalRows + 2);
  return Array.from({ length: totalRows }, (_, i) => ({
    rank: i + 1,
    memberId: i < rotated.length ? rotated[i] : null,
    lots: Math.round((base - i * step) * 100) / 100,
  }));
}
