/** Shared types + constants for the Activities (monthly trading competitions)
 *  feature. Activities are admin-managed rows in the database (see the
 *  `Activity` Prisma model); this module is import-safe on both client and
 *  server (no Prisma import). */

export type ActivityStatus = "upcoming" | "live" | "finished";

/** How members compete: `registered` (own partner-broker account, lots from
 *  the lot webhook) or `demo_legacy` (old demo-only competitions — frozen:
 *  viewable, no new enrollments). */
export type ActivityMode = "registered" | "demo_legacy";

/** One admin-managed activity, as sent to both CRM and customer pages. */
export type ActivityDto = {
  id: number;
  slug: string;
  title: string;
  description: string;
  status: ActivityStatus;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  traders: number;
  prizePool: number;
  /** Cover image URL or data URL (empty = render the default trophy card). */
  coverImage?: string;
  /** YYYY-MM-DD — when customers first see it (empty = as soon as published). */
  visibleFrom?: string;
  /** YYYY-MM-DD — when registration opens (empty = immediately). */
  registrationOpensAt?: string;
  /** Customer view only: whether registration is open right now. */
  registrationOpen?: boolean;
  /** Already split into lines (empty when the admin left them blank). */
  rules: string[];
  published: boolean;
  sortOrder: number;
  /** Whether the signed-in member is registered. Always false for admin reads. */
  enrolled: boolean;
  mode: ActivityMode;
  /** ISO timestamp — set once winners are locked and prize claims created. */
  winnersFinalizedAt?: string;
  /** Customer view only: the competition account the member registered. */
  enrolledTradeId?: string;
  /** Prize table (admin-managed). Empty when the admin hasn't set one. */
  prizes: CompetitionPrizeDto[];
};

/** Result of classifying a competition account as live (in the BeSight IB
 *  campaign data) or demo (not present). "unknown" means the check itself
 *  failed — the account is neither confirmed live nor confirmed demo. */
export type AccountKind = "live" | "demo" | "unknown";

export type AccountCheckResult = {
  allowed: boolean;
  message: string;
  tradeId?: string;
  broker?: string;
};

export const ACTIVITY_STATUSES: ActivityStatus[] = ["upcoming", "live", "finished"];

/** Brokers whose accounts may enter registered-mode competitions — the lot
 *  webhook covers partner campaign data only. */
export const PARTNER_BROKER_CODES = ["XM", "EXNESS"];

/** One member's registration for an activity, as sent to the CRM participants
 *  panel. `joinedAt` is the enrollment date (YYYY-MM-DD). */
export type ActivityEnrollmentDto = {
  id: number;
  memberId: number;
  memberCode: string;
  memberName: string;
  email: string;
  /** The competition account the member registered with (live or demo). */
  tradeId: string;
  isDemo: boolean;
  verified: boolean;
  verificationNote?: string;
  /** Lots counted for this activity's window only. */
  lots: number;
  /** YYYY-MM-DD HH:mm (local) — when the score was last refreshed. */
  lotsAt?: string;
  joinedAt: string;
};

/** One row of an activity's standings, computed from the enrollment snapshots. */
export type ActivityLeaderboardRow = {
  rank: number;
  memberName: string;
  lots: number;
  isMe: boolean;
};

export type ActivityStanding = {
  rank: number;
  lots: number;
  verified: boolean;
  isDemo: boolean;
  verificationNote?: string;
} | null;

/** Same $2,000 / Top-20 prize pool for every competition (see
 *  dash.activities.prizeText) — modeled as a shared tiered breakdown rather
 *  than per-activity data. The activity row carries the headline total
 *  (`prizePool`); this is the standard distribution shown underneath. */
export const PRIZE_POOL = 2000;

export const PRIZE_TIERS: { rankKey: string; amount: number }[] = [
  { rankKey: "1", amount: 500 },
  { rankKey: "2", amount: 350 },
  { rankKey: "3", amount: 250 },
  { rankKey: "4-10", amount: 100 },
  { rankKey: "11-20", amount: 20 },
];

/** Default rule set (i18n keys) shown when an activity has no custom rules. */
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

/** One prize row of an activity's prize table. */
export type CompetitionPrizeDto = {
  id: number;
  rankFrom: number;
  rankTo: number;
  title: string;
  valueNote?: string;
  sortOrder: number;
};

/** One loyalty tier of the admin-managed ladder. */
export type RewardTierDto = {
  id: number;
  key: string;
  title: string;
  titleEn?: string;
  threshold: number;
  reward: string;
  rewardEn?: string;
  icon: string;
  image?: string;
  accent: string;
  sortOrder: number;
  active: boolean;
};

export type RewardClaimKind = "tier" | "competition" | "manual";
export type RewardClaimStatus = "pending" | "fulfilled" | "cancelled";

/** One member reward in the shared fulfilment queue. */
export type RewardClaimDto = {
  id: number;
  memberId: number;
  memberCode: string;
  memberName: string;
  kind: RewardClaimKind;
  refKey: string;
  activityId?: number;
  activityTitle?: string;
  title: string;
  detail?: string;
  status: RewardClaimStatus;
  note?: string;
  createdAt: string;
  decidedAt?: string;
};
