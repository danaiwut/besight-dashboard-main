import { RecordStatus } from "@/generated/prisma/client";
import { lotWindowForPeriod, normalizeCountMode, selectAccountsToCount, type LotPeriod } from "../lotEngine";
import { readGeneralSettings } from "./generalSettings";
import { getPrisma, isDatabaseConfigured } from "./prisma";
import { sumTradeIds } from "./lotService";

const CONCURRENCY = 20;

function currentMonthRange() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

type SnapshotMember = {
  id: number;
  crmStartDate: Date | null;
  crmExpiryDate: Date | null;
  primaryTradeAccountId: number | null;
  tradeAccounts: Array<{ id: number; tradeId: string; status?: string }>;
};

/** Honours Settings.lotCalculationMode and de-duplicates repeated trade IDs, so
 *  a duplicated account row can never contribute its lots twice. Counts EVERY
 *  active account regardless of verification (see lib/lotEngine.ts). */
function accountsToCount(member: SnapshotMember, mode: string) {
  return selectAccountsToCount(
    member.tradeAccounts.map((a) => ({ id: a.id, tradeId: a.tradeId, status: a.status ?? "active" })),
    normalizeCountMode(mode),
    member.primaryTradeAccountId,
  );
}

/** Live lots for one member over its CURRENT qualification window (default: the
 *  monthly cycle), persisted together with that window (from/to) so display
 *  layers can tell a fresh snapshot from a stale-window one. Throws when the
 *  webhook call fails — callers decide whether to count a failure or surface it. */
export async function computeAndPersistMemberLots(member: SnapshotMember, period: LotPeriod = "cycle"): Promise<number> {
  const prisma = getPrisma();
  const fallback = currentMonthRange();
  const settings = await readGeneralSettings();
  const cycle = lotWindowForPeriod(
    {
      crmStartDate: member.crmStartDate?.toISOString().slice(0, 10),
      crmExpiryDate: member.crmExpiryDate?.toISOString().slice(0, 10),
    },
    period,
  );
  const from = cycle?.from ?? fallback.from;
  const to = cycle?.to ?? fallback.to;
  const { total } = await sumTradeIds(
    accountsToCount(member, settings.lotCalculationMode).map((account) => account.tradeId),
    from,
    to,
  );
  await prisma.member.update({
    where: { id: member.id },
    data: {
      currentPeriodLots: total,
      currentPeriodLotsAt: new Date(),
      currentPeriodLotsFrom: new Date(`${from}T00:00:00Z`),
      currentPeriodLotsTo: new Date(`${to}T00:00:00Z`),
    },
  });
  return total;
}

/** Recompute one member by id (used by the per-member refresh endpoint and
 *  the customer sync when a member's window changes). Returns null when the
 *  member has no active accounts or is gone — nothing persisted then. */
export async function snapshotOneMemberLots(memberId: number, period: LotPeriod = "cycle"): Promise<number | null> {
  const prisma = getPrisma();
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      crmStartDate: true,
      crmExpiryDate: true,
      primaryTradeAccountId: true,
      tradeAccounts: {
        where: { status: RecordStatus.active },
        select: { id: true, tradeId: true, status: true },
      },
    },
  });
  if (!member || !member.tradeAccounts.length) return null;
  return computeAndPersistMemberLots(member, period);
}

/**
 * Real per-member lots, straight from the CRM lot-check webhook — the same
 * data source the renewal engine qualifies members against. Runs over every
 * member with at least one active trade account and persists the
 * period total onto Member.currentPeriodLots so the Members list can read a
 * real number without a live webhook call per row.
 */
export async function snapshotMemberLots() {
  if (!isDatabaseConfigured()) return { updated: 0, failed: 0, skipped: "DATABASE_URL is not configured" };
  const prisma = getPrisma();

  const members = await prisma.member.findMany({
    select: {
      id: true,
      crmStartDate: true,
      crmExpiryDate: true,
      primaryTradeAccountId: true,
      tradeAccounts: {
        where: { status: RecordStatus.active },
        select: { id: true, tradeId: true, status: true },
      },
    },
    where: { tradeAccounts: { some: { status: RecordStatus.active } } },
  });

  let updated = 0;
  let failed = 0;

  await mapWithConcurrency(members, CONCURRENCY, async (member) => {
    try {
      await computeAndPersistMemberLots(member);
      updated += 1;
    } catch {
      failed += 1;
    }
  });

  return { updated, failed, total: members.length };
}
