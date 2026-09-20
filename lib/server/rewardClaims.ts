import { getPrisma } from "./prisma";
import { bumpDataVersion } from "./dataVersion";

/** Shared reward-claim helpers (tiers + competition prizes share one queue). */

export type FinalizeWinner = {
  rank: number;
  memberId: number;
  memberName: string;
  lots: number;
  prizeTitle: string;
};

/** Lifetime lots for one member, straight from the trade ledger (the same
 *  source the dashboard loyalty ladder reads). */
export async function lifetimeLots(memberId: number): Promise<number> {
  const rows = await getPrisma().tradeLog.aggregate({
    where: { memberId },
    _sum: { lots: true },
  });
  return rows._sum.lots?.toNumber() ?? 0;
}

/** Creates a tier claim after honestly re-checking the threshold server-side.
 *  One claim per member+tier (unique key) — a re-claim throws P2002. */
export async function createTierClaim(memberId: number, tierKey: string) {
  const prisma = getPrisma();
  const tier = await prisma.rewardTier.findUnique({ where: { key: tierKey } });
  if (!tier || !tier.active) throw new Error("Reward tier not found");
  const threshold = tier.threshold.toNumber();
  const lots = await lifetimeLots(memberId);
  if (lots < threshold) throw new Error(`ต้องสะสม ${threshold} lots ก่อนรับรางวัลขั้นนี้`);
  const claim = await prisma.rewardClaim.create({
    data: {
      memberId,
      kind: "tier",
      refKey: `tier:${tier.key}`,
      title: tier.reward,
      detail: `ขั้น ${tier.title} — สะสม ${lots.toFixed(2)} lots`,
    },
    include: { member: { select: { code: true, name: true, displayName: true } }, activity: { select: { title: true } } },
  });
  await bumpDataVersion();
  return { claim, lots, threshold };
}

/** Locks winners for a finished activity and creates one pending claim per
 *  prize-row winner. Idempotent: re-running skips already-claimed ranks and
 *  never moves the lock timestamp. */
export async function finalizeActivity(activityId: number): Promise<{ winners: FinalizeWinner[]; claimsCreated: number; alreadyFinalized: boolean }> {
  const prisma = getPrisma();
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: {
      prizes: { orderBy: [{ sortOrder: "asc" }, { rankFrom: "asc" }] },
      enrollments: {
        orderBy: [{ lots: "desc" }, { createdAt: "asc" }],
        include: { member: { select: { name: true, displayName: true } } },
      },
    },
  });
  if (!activity) throw new Error("Activity not found");
  if (activity.status !== "finished") throw new Error("สรุปผลได้เฉพาะกิจกรรมที่สิ้นสุดแล้ว");
  if (!activity.prizes.length) throw new Error("กรุณาตั้งตารางรางวัลก่อนสรุปผล");

  const ranked = activity.enrollments.map((row, index) => ({
    rank: index + 1,
    memberId: row.memberId,
    memberName: row.member.displayName?.trim() || row.member.name,
    lots: row.lots.toNumber(),
  }));
  // A prize needs a real score — zero-lot rows never win.
  const winners: FinalizeWinner[] = [];
  for (const prize of activity.prizes) {
    for (const row of ranked) {
      if (row.rank < prize.rankFrom || row.rank > prize.rankTo || row.lots <= 0) continue;
      winners.push({
        rank: row.rank,
        memberId: row.memberId,
        memberName: row.memberName,
        lots: row.lots,
        prizeTitle: prize.title,
      });
    }
  }

  const created = await prisma.rewardClaim.createMany({
    data: winners.map((winner) => ({
      memberId: winner.memberId,
      kind: "competition",
      refKey: `activity:${activity.id}:rank:${winner.rank}`,
      activityId: activity.id,
      title: `${activity.title} — อันดับ ${winner.rank}`,
      detail: `${winner.prizeTitle} (${winner.lots.toFixed(2)} lots)`,
    })),
    skipDuplicates: true,
  });
  const alreadyFinalized = Boolean(activity.winnersFinalizedAt);
  if (!alreadyFinalized) {
    await prisma.activity.update({ where: { id: activity.id }, data: { winnersFinalizedAt: new Date() } });
  }
  await bumpDataVersion();
  return { winners, claimsCreated: created.count, alreadyFinalized };
}
