import { RecordStatus, VerificationStatus } from "@/generated/prisma/client";
import { fetchAccountLotCheck } from "./lotCheck";
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
  const accounts = await prisma.tradeAccount.findMany({
    where: { status: RecordStatus.active, verification: VerificationStatus.verified },
    select: { id: true, memberId: true, tradeId: true },
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
  const pruned = await prisma.tradeLog.deleteMany({ where: { tradeDate: { lt: cutoff } } });

  return { snapshotted, pruned: pruned.count };
}
