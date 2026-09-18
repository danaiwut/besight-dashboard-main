import { NextRequest, NextResponse } from "next/server";
import { IndicatorAccessStatus, RecordStatus } from "@/generated/prisma/client";
import { currentMonthIso, lotWindowForPeriod } from "@/lib/lotEngine";
import { persistLotCheckAndAutomate } from "@/lib/server/indicatorAutomation";
import { getMemberLotsForWindow } from "@/lib/server/lotService";
import { lotWindowForExpiry } from "@/lib/server/lotCheck";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  }

  const defaults = currentMonthIso();
  const forcedDateFrom = request.nextUrl.searchParams.get("date_from");
  const forcedDateTo = request.nextUrl.searchParams.get("date_to");
  const forcedRange = forcedDateFrom && forcedDateTo ? { dateFrom: forcedDateFrom, dateTo: forcedDateTo, period: `${forcedDateFrom}_${forcedDateTo}` } : null;
  const now = new Date();
  const prisma = getPrisma();
  // One pass per MEMBER (not per account): qualification uses the member total
  // across every active account, so a member with two half-threshold accounts
  // still renews. Only members holding active indicator access are visited.
  const members = await prisma.member.findMany({
    where: {
      indicatorAccess: { some: { status: IndicatorAccessStatus.active } },
      tradeAccounts: { some: { status: RecordStatus.active } },
    },
    select: {
      id: true,
      code: true,
      crmStartDate: true,
      crmExpiryDate: true,
      primaryTradeAccountId: true,
      tradeAccounts: {
        where: { status: RecordStatus.active },
        select: { id: true, tradeId: true },
      },
      indicatorAccess: {
        where: { status: IndicatorAccessStatus.active },
        select: { indicatorId: true, expiresAt: true },
        orderBy: { expiresAt: "asc" },
      },
    },
  });

  const outcomes: Array<{ memberId: number; code: string; ok: boolean; lots?: number; qualified?: boolean | null; granted?: number; renewed?: number; error?: string }> = [];
  for (const member of members) {
    try {
      const dueAccess = member.indicatorAccess.filter((access) => access.expiresAt <= now);
      if (!forcedRange && member.indicatorAccess.length && !dueAccess.length) continue;

      /* Monthly cycle anchored on the access start day (started Feb 10 →
         Feb 10–Mar 10, then Mar 10–Apr 10, …) — the same window the dashboard
         and CRM show. The expiry-relative window is only a fallback for
         members with no CRM dates on file. */
      const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : undefined);
      const cycle = lotWindowForPeriod(
        { crmStartDate: day(member.crmStartDate), crmExpiryDate: day(member.crmExpiryDate) },
        "cycle",
        now,
      );
      const range = forcedRange
        || (cycle
          ? { dateFrom: cycle.from, dateTo: cycle.to, period: `${cycle.from}_${cycle.to}` }
          : dueAccess.length
            ? (() => { const w = lotWindowForExpiry(dueAccess[0].expiresAt); return { dateFrom: w.dateFrom, dateTo: w.dateTo, period: w.period }; })()
            : { dateFrom: defaults.from, dateTo: defaults.to, period: `${defaults.from}_${defaults.to}` });
      const live = await getMemberLotsForWindow(member.id, range.dateFrom, range.dateTo);
      const data = {
        account: live.byAccount.map((row) => ({ campaignName: "", loginId: row.tradeId, lots: row.lots })),
        campaigns: [],
        countries: [],
        excludedSymbols: [],
        totalLots: live.lots,
      };
      const automation = await persistLotCheckAndAutomate({
        memberId: member.id,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        data,
        autoGrant: true,
        period: range.period,
        memberTotalLots: live.lots,
        indicatorIds: forcedRange ? undefined : (dueAccess.length ? dueAccess.map((access) => access.indicatorId) : undefined),
      });
      outcomes.push({ memberId: member.id, code: member.code, ok: true, lots: live.lots, qualified: automation.qualified, granted: automation.granted, renewed: automation.renewed });
    } catch (error) {
      outcomes.push({ memberId: member.id, code: member.code, ok: false, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  return NextResponse.json({
    ok: outcomes.every((outcome) => outcome.ok),
    dateFrom: forcedRange?.dateFrom || defaults.from,
    dateTo: forcedRange?.dateTo || defaults.to,
    checked: outcomes.length,
    qualified: outcomes.filter((outcome) => outcome.qualified).length,
    granted: outcomes.reduce((sum, outcome) => sum + (outcome.granted || 0), 0),
    renewed: outcomes.reduce((sum, outcome) => sum + (outcome.renewed || 0), 0),
    failed: outcomes.filter((outcome) => !outcome.ok).length,
    outcomes,
  });
}
