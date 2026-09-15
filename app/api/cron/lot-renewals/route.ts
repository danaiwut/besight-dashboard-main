import { NextRequest, NextResponse } from "next/server";
import { RecordStatus, VerificationStatus } from "@/generated/prisma/client";
import { persistLotCheckAndAutomate } from "@/lib/server/indicatorAutomation";
import { fetchAccountLotCheck } from "@/lib/server/lotCheck";
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
  const dateFrom = request.nextUrl.searchParams.get("date_from") || defaults.dateFrom;
  const dateTo = request.nextUrl.searchParams.get("date_to") || defaults.dateTo;
  const accounts = await getPrisma().tradeAccount.findMany({
    where: { status: RecordStatus.active, verification: VerificationStatus.verified },
    select: { tradeId: true },
  });

  const outcomes: Array<{ tradeId: string; ok: boolean; qualified?: boolean | null; granted?: number; renewed?: number; error?: string }> = [];
  for (const account of accounts) {
    try {
      const data = await fetchAccountLotCheck(dateFrom, dateTo, account.tradeId);
      const automation = await persistLotCheckAndAutomate({ tradeId: account.tradeId, dateFrom, dateTo, data, autoGrant: true });
      outcomes.push({ tradeId: account.tradeId, ok: true, qualified: automation.qualified, granted: automation.granted, renewed: automation.renewed });
    } catch (error) {
      outcomes.push({ tradeId: account.tradeId, ok: false, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  return NextResponse.json({
    ok: outcomes.every((outcome) => outcome.ok),
    dateFrom,
    dateTo,
    checked: outcomes.length,
    qualified: outcomes.filter((outcome) => outcome.qualified).length,
    granted: outcomes.reduce((sum, outcome) => sum + (outcome.granted || 0), 0),
    renewed: outcomes.reduce((sum, outcome) => sum + (outcome.renewed || 0), 0),
    failed: outcomes.filter((outcome) => !outcome.ok).length,
    outcomes,
  });
}
