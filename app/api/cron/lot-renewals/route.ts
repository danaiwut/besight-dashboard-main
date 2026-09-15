import { NextRequest, NextResponse } from "next/server";
import { IndicatorAccessStatus, RecordStatus, VerificationStatus } from "@/generated/prisma/client";
import { persistLotCheckAndAutomate } from "@/lib/server/indicatorAutomation";
import { fetchAccountLotCheck, lotWindowForExpiry } from "@/lib/server/lotCheck";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function monthRange() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: to.toISOString().slice(0, 10) };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  }

  const defaults = monthRange();
  const forcedDateFrom = request.nextUrl.searchParams.get("date_from");
  const forcedDateTo = request.nextUrl.searchParams.get("date_to");
  const forcedRange = forcedDateFrom && forcedDateTo ? { dateFrom: forcedDateFrom, dateTo: forcedDateTo, period: `${forcedDateFrom}_${forcedDateTo}` } : null;
  const now = new Date();
  const accounts = await getPrisma().tradeAccount.findMany({
    where: { status: RecordStatus.active, verification: VerificationStatus.verified },
    select: {
      tradeId: true,
      member: {
        select: {
          indicatorAccess: {
            where: { status: IndicatorAccessStatus.active },
            select: { indicatorId: true, expiresAt: true },
            orderBy: { expiresAt: "asc" },
          },
        },
      },
    },
  });

  const outcomes: Array<{ tradeId: string; ok: boolean; qualified?: boolean | null; granted?: number; renewed?: number; error?: string }> = [];
  for (const account of accounts) {
    try {
      const dueAccess = account.member.indicatorAccess.filter((access) => access.expiresAt <= now);
      if (!forcedRange && account.member.indicatorAccess.length && !dueAccess.length) continue;
      const range = forcedRange || (dueAccess.length ? lotWindowForExpiry(dueAccess[0].expiresAt) : { ...defaults, period: `${defaults.dateFrom}_${defaults.dateTo}` });
      const data = await fetchAccountLotCheck(range.dateFrom, range.dateTo, account.tradeId);
      const automation = await persistLotCheckAndAutomate({
        tradeId: account.tradeId,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        data,
        autoGrant: true,
        period: range.period,
        indicatorIds: forcedRange ? undefined : (dueAccess.length ? dueAccess.map((access) => access.indicatorId) : undefined),
      });
      outcomes.push({ tradeId: account.tradeId, ok: true, qualified: automation.qualified, granted: automation.granted, renewed: automation.renewed });
    } catch (error) {
      outcomes.push({ tradeId: account.tradeId, ok: false, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  return NextResponse.json({
    ok: outcomes.every((outcome) => outcome.ok),
    dateFrom: forcedRange?.dateFrom || defaults.dateFrom,
    dateTo: forcedRange?.dateTo || defaults.dateTo,
    checked: outcomes.length,
    qualified: outcomes.filter((outcome) => outcome.qualified).length,
    granted: outcomes.reduce((sum, outcome) => sum + (outcome.granted || 0), 0),
    renewed: outcomes.reduce((sum, outcome) => sum + (outcome.renewed || 0), 0),
    failed: outcomes.filter((outcome) => !outcome.ok).length,
    outcomes,
  });
}
