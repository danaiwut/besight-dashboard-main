import { NextRequest, NextResponse } from "next/server";
import { lotWindowForPeriod, qualify, type LotPeriod } from "@/lib/lotEngine";
import { persistLotCheckAndAutomate } from "@/lib/server/indicatorAutomation";
import { fetchLotChecks } from "@/lib/server/lotCheck";
import { getMemberLotsForWindow } from "@/lib/server/lotService";
import { readIndicatorAutomationSettings } from "@/lib/server/indicatorSettings";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { adminGuard, adminWriteGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to check lots";
  const isInputError = message.includes("date_") || message.includes("YYYY-MM-DD");
  return NextResponse.json({ ok: false, error: message }, { status: isInputError ? 400 : 502 });
}

export async function GET(request: NextRequest) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  try {
    const dateFrom = request.nextUrl.searchParams.get("date_from") || "";
    const dateTo = request.nextUrl.searchParams.get("date_to") || "";
    const tradeId = request.nextUrl.searchParams.get("tradeid") || undefined;
    const data = await fetchLotChecks(dateFrom, dateTo, tradeId);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  try {
    const body = await request.json() as { dateFrom?: string; dateTo?: string; tradeId?: string; memberId?: number; autoGrant?: boolean; dryRun?: boolean; period?: string };
    const tradeId = body.tradeId?.trim() || undefined;
    const memberId = Number(body.memberId);
    const hasMemberId = Number.isInteger(memberId) && memberId > 0;
    const dryRun = body.dryRun === true;
    let dateFrom = body.dateFrom || "";
    let dateTo = body.dateTo || "";

    /* The admin picks the period (default: the member's current monthly cycle
       — the same window the list, snapshots and renewal cron qualify against):
        - cycle: the member's anchored monthly cycle
        - entitlement: the whole access window (start → expiry)
        - month: the current calendar month
        - custom: whatever dates were passed in
       Qualification ALWAYS uses the member total across every active account,
       never a single tradeId in isolation. */
    const period: LotPeriod | "custom" = ["cycle", "entitlement", "month", "custom"].includes(body.period ?? "")
      ? (body.period as LotPeriod | "custom")
      : "cycle";
    let resolvedBy: string | null = null;
    let linkedMemberId: number | null = hasMemberId ? memberId : null;
    if (isDatabaseConfigured() && (tradeId || hasMemberId) && period !== "custom") {
      const prisma = getPrisma();
      const linked = tradeId
        ? await prisma.tradeAccount.findFirst({
            where: { tradeId },
            select: { memberId: true, member: { select: { crmStartDate: true, crmExpiryDate: true } } },
          })
        : null;
      const direct = hasMemberId
        ? await prisma.member.findUnique({
            where: { id: memberId },
            select: { id: true, crmStartDate: true, crmExpiryDate: true },
          })
        : null;
      if (tradeId && linked) linkedMemberId = linked.memberId;
      const dates = direct ?? linked?.member;
      const window = lotWindowForPeriod(
        {
          crmStartDate: dates?.crmStartDate?.toISOString().slice(0, 10),
          crmExpiryDate: dates?.crmExpiryDate?.toISOString().slice(0, 10),
        },
        period,
      );
      if (window) {
        dateFrom = window.from;
        dateTo = window.to;
        resolvedBy = period;
      }
    }
    // System-wide aggregates (campaign/country/excluded-symbol). When the
    // check is linked to a member, the account breakdown comes from the
    // member total (every active account); otherwise it is the single
    // tradeId's own rows.
    let data = await fetchLotChecks(dateFrom, dateTo, linkedMemberId != null || !tradeId ? undefined : tradeId);

    // Member total across EVERY active account (deduped tradeIds).
    let memberTotal: number | null = null;
    let byAccount: Array<{ accountId: number; tradeId: string; lots: number }> = [];
    if (linkedMemberId != null && isDatabaseConfigured()) {
      const live = await getMemberLotsForWindow(linkedMemberId, dateFrom, dateTo);
      memberTotal = live.lots;
      byAccount = live.byAccount;
      data = { ...data, account: byAccount.map((row) => ({ campaignName: "", loginId: row.tradeId, lots: row.lots })) };
    } else if (tradeId) {
      memberTotal = data.totalLots;
      byAccount = data.account.map((row) => ({ accountId: 0, tradeId: row.loginId || tradeId, lots: row.lots }));
    }
    const totalLots = memberTotal ?? data.totalLots;
    const memberData = { ...data, totalLots };

    /* Automatic grants run ONLY on the member's current monthly cycle.
       Other periods (entitlement / month / custom) are view-only: they are
       forced into dry-run so one set of lots can never renew the same
       indicator twice through overlapping windows. */
    const grantablePeriod = period === "cycle";
    const effectiveDryRun = dryRun || !grantablePeriod;
    const cycleNote = grantablePeriod
      ? null
      : "Automatic grant runs on the member's monthly cycle only — switch to รอบเดือนของสมาชิก to grant";

    if (effectiveDryRun) {
      // Preview only — nothing is written (no LotCheckRun, no grants).
      const automationSettings = isDatabaseConfigured() ? await readIndicatorAutomationSettings() : null;
      let requiredLots: number | null = automationSettings?.requiredLots ?? null;
      if (linkedMemberId != null && isDatabaseConfigured()) {
        const member = await getPrisma().member.findUnique({ where: { id: linkedMemberId }, select: { requiredLotsOverride: true } });
        requiredLots = member?.requiredLotsOverride?.toNumber() ?? requiredLots;
      }
      return NextResponse.json({
        ok: true,
        data: memberData,
        memberTotal: totalLots,
        byAccount,
        automation: {
          database: false,
          preview: true,
          linkedMember: null,
          qualified: requiredLots != null ? qualify(totalLots, requiredLots) : null,
          requiredLots,
          granted: 0,
          renewed: 0,
          skipped: cycleNote ?? "Dry run — nothing was written",
        },
        dateFrom,
        dateTo,
        period: resolvedBy ?? "custom",
      });
    }

    const automation = await persistLotCheckAndAutomate({
      tradeId,
      memberId: linkedMemberId ?? undefined,
      dateFrom,
      dateTo,
      data: memberData,
      autoGrant: body.autoGrant !== false,
      memberTotalLots: totalLots,
    });
    return NextResponse.json({ ok: true, data: memberData, memberTotal: totalLots, byAccount, automation, dateFrom, dateTo, period: resolvedBy ?? "custom" });
  } catch (error) {
    return errorResponse(error);
  }
}
