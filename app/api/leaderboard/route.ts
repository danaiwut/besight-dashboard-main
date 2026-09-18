import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

export type LeaderboardPeriod = "daily" | "monthly";

export type LeaderboardRowDto = {
  rank: number;
  memberId: number;
  name: string;
  code: string;
  country?: string;
  lots: number;
  rebate: number;
  /** Rank in the previous comparable window, when one exists. */
  previousRank: number | null;
};

function monthWindow(offset = 0) {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0, 23, 59, 59, 999));
  return { from, to };
}

type Totals = { memberId: number; lots: number; rebate: number };

/** Sums each member's lots/rebate over a window — the CRM's own trade ledger,
 *  never the member's entitlement-period snapshot. */
async function totalsInWindow(from: Date, to: Date): Promise<Totals[]> {
  const grouped = await getPrisma().tradeLog.groupBy({
    by: ["memberId"],
    where: { tradeDate: { gte: from, lte: to } },
    _sum: { lots: true, rebate: true },
  });
  return grouped.map((row) => ({
    memberId: row.memberId,
    lots: row._sum.lots?.toNumber() ?? 0,
    rebate: row._sum.rebate?.toNumber() ?? 0,
  }));
}

function rankByLots(totals: Totals[]) {
  const ranked = [...totals]
    .filter((row) => row.lots > 0)
    .sort((a, b) => b.lots - a.lots || b.rebate - a.rebate);
  return new Map(ranked.map((row, index) => [row.memberId, index + 1]));
}

async function memberInfo(ids: number[]) {
  if (!ids.length) return new Map<number, { name: string; code: string; country: string | null }>();
  const rows = await getPrisma().member.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, displayName: true, code: true, country: true },
  });
  return new Map(rows.map((row) => [row.id, { name: row.displayName?.trim() || row.name, code: row.code, country: row.country }]));
}

/** Calendar-period lot leaderboard. "monthly" = the current calendar month,
 *  "daily" = the most recent trade day that actually has data (the snapshot
 *  cron writes one row per account per day). */
export async function GET(request: NextRequest) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  try {
    const prisma = getPrisma();
    const period: LeaderboardPeriod = request.nextUrl.searchParams.get("period") === "daily" ? "daily" : "monthly";

    let from: Date;
    let to: Date;
    let previous: { from: Date; to: Date } | null = null;

    if (period === "monthly") {
      ({ from, to } = monthWindow(0));
      previous = monthWindow(-1);
    } else {
      // The latest day that has data (falls back to today when empty).
      const latest = await prisma.tradeLog.aggregate({ _max: { tradeDate: true } });
      const day = latest._max.tradeDate ?? new Date();
      from = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
      to = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 23, 59, 59, 999));
      const before = await prisma.tradeLog.aggregate({ _max: { tradeDate: true }, where: { tradeDate: { lt: from } } });
      if (before._max.tradeDate) {
        const prevDay = before._max.tradeDate;
        previous = {
          from: new Date(Date.UTC(prevDay.getUTCFullYear(), prevDay.getUTCMonth(), prevDay.getUTCDate())),
          to: new Date(Date.UTC(prevDay.getUTCFullYear(), prevDay.getUTCMonth(), prevDay.getUTCDate(), 23, 59, 59, 999)),
        };
      }
    }

    const [current, prev] = await Promise.all([
      totalsInWindow(from, to),
      previous ? totalsInWindow(previous.from, previous.to) : Promise.resolve([] as Totals[]),
    ]);
    const currentRanks = rankByLots(current);
    const prevRanks = rankByLots(prev);
    const ranked = [...current]
      .filter((row) => row.lots > 0)
      .sort((a, b) => b.lots - a.lots || b.rebate - a.rebate)
      .slice(0, 200);

    const info = await memberInfo(ranked.map((row) => row.memberId));
    const memberId = await resolveMemberIdForUser(guard.user);

    const rows: LeaderboardRowDto[] = ranked.map((row) => {
      const member = info.get(row.memberId);
      return {
        rank: currentRanks.get(row.memberId) ?? 0,
        memberId: row.memberId,
        name: member?.name ?? "—",
        code: member?.code ?? "—",
        country: member?.country || undefined,
        lots: Math.round(row.lots * 100) / 100,
        rebate: Math.round(row.rebate * 100) / 100,
        previousRank: prevRanks.get(row.memberId) ?? null,
      };
    });

    // The signed-in member's own standing, even when outside the returned page.
    let me: LeaderboardRowDto | null = null;
    if (memberId) {
      const mine = current.find((row) => row.memberId === memberId);
      if (mine && mine.lots > 0) {
        const member = (await memberInfo([memberId])).get(memberId);
        me = {
          rank: currentRanks.get(memberId) ?? 0,
          memberId,
          name: member?.name ?? "—",
          code: member?.code ?? "—",
          country: member?.country || undefined,
          lots: Math.round(mine.lots * 100) / 100,
          rebate: Math.round(mine.rebate * 100) / 100,
          previousRank: prevRanks.get(memberId) ?? null,
        };
      }
    }

    return NextResponse.json({
      ok: true,
      period,
      from: from.toISOString(),
      to: to.toISOString(),
      updatedAt: to.toISOString(),
      rows,
      me,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load leaderboard" }, { status: 500 });
  }
}
