import { RecordStatus, VerificationStatus } from "@/generated/prisma/client";
import { fetchAccountLotCheck } from "./lotCheck";
import { becRateMap, readSpinSettings } from "./spin";
import { getPrisma, isDatabaseConfigured } from "./prisma";

const HISTORY_MONTHS = 3;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * There is no trade-level history feed from the CRM/lot-check webhook — only an
 * aggregate lots total per account per date range. So "history" here means: record
 * today's real total once a day going forward, and keep a rolling 3-month window.
 * Nothing is backfilled for days before this ran.
 */
export async function snapshotTradeLogs() {
  if (!isDatabaseConfigured()) return { snapshotted: 0, pruned: 0, skipped: "DATABASE_URL is not configured" };
  const prisma = getPrisma();
  const date = todayUtc();
  const allAccounts = await prisma.tradeAccount.findMany({
    where: { status: RecordStatus.active, verification: VerificationStatus.verified },
    select: { id: true, memberId: true, tradeId: true },
    orderBy: { id: "asc" },
  });
  /* Upstream data can carry the same Trade ID under several members. Only the
     oldest active account writes logs, so one set of trades can never credit
     two members in the leaderboard / BEC / level math. */
  const claimedTradeIds = new Set<string>();
  const accounts = allAccounts.filter((account) => {
    if (claimedTradeIds.has(account.tradeId)) return false;
    claimedTradeIds.add(account.tradeId);
    return true;
  });

  let snapshotted = 0;
  for (const account of accounts) {
    try {
      const data = await fetchAccountLotCheck(date, date, account.tradeId);
      if (data.totalLots <= 0) continue;
      const campaignName = data.account[0]?.campaignName || null;
      await prisma.tradeLog.upsert({
        where: { externalKey: `${account.id}:${date}` },
        update: { lots: data.totalLots, campaignName },
        create: {
          tradeAccountId: account.id,
          memberId: account.memberId,
          externalKey: `${account.id}:${date}`,
          symbol: "ALL",
          lots: data.totalLots,
          campaignName,
          tradeDate: new Date(`${date}T00:00:00Z`),
        },
      });
      snapshotted += 1;
    } catch {
      // one account's lot-check failing should not block the rest of the run
    }
  }

  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - HISTORY_MONTHS);

  /* Materialize the BEC those expiring logs earned BEFORE deleting them, so a
     member's total points never shrink just because history aged out. */
  const expiring = await prisma.tradeLog.findMany({
    where: { tradeDate: { lt: cutoff } },
    select: { memberId: true, symbol: true, lots: true },
  });
  let granted = 0;
  if (expiring.length) {
    const settings = await readSpinSettings();
    const { map, fallback } = await becRateMap(settings);
    const byMember = new Map<number, { lots: number; points: number }>();
    for (const log of expiring) {
      const rate = map.get(log.symbol.trim().toUpperCase()) ?? fallback;
      const lots = log.lots.toNumber();
      const totals = byMember.get(log.memberId) ?? { lots: 0, points: 0 };
      totals.lots += lots;
      totals.points += lots * rate;
      byMember.set(log.memberId, totals);
    }
    for (const [memberId, totals] of byMember) {
      if (totals.points <= 0) continue;
      await prisma.becGrant.create({
        data: { memberId, lots: totals.lots, points: Math.round(totals.points * 10000) / 10000, note: `trade-log prune ${date}` },
      });
      granted += 1;
    }
  }
  const pruned = await prisma.tradeLog.deleteMany({ where: { tradeDate: { lt: cutoff } } });

  return { snapshotted, pruned: pruned.count, granted };
}
