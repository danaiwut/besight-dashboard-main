import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { getMemberLots, type LotPeriod } from "@/lib/server/lotService";
import { adminGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

const PERIODS: LotPeriod[] = ["cycle", "entitlement", "month"];

/** Read-only live lots for one member (no persistence).
 *  Default period is the member's current monthly cycle — the same window the
 *  list, snapshots and renewal cron qualify against. `entitlement`/`month`
 *  are view-only alternatives for the detail period switcher and the trade
 *  accounts card breakdown. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid member id" }, { status: 400 });
    const rawPeriod = request.nextUrl.searchParams.get("period");
    const period: LotPeriod = PERIODS.includes(rawPeriod as LotPeriod) ? (rawPeriod as LotPeriod) : "cycle";
    const prisma = getPrisma();
    const existing = await prisma.member.findUnique({
      where: { id },
      select: {
        id: true,
        currentPeriodLots: true,
        currentPeriodLotsAt: true,
        currentPeriodLotsFrom: true,
        currentPeriodLotsTo: true,
      },
    });
    if (!existing) return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });

    const live = await getMemberLots(id, period);
    const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    return NextResponse.json({
      ok: true,
      memberId: id,
      period,
      window: live.window,
      lots: live.lots,
      byAccount: live.byAccount,
      requiredLots: live.requiredLots,
      qualified: live.qualified,
      checkedAt: live.checkedAt,
      source: "webhook",
      snapshot: {
        lots: existing.currentPeriodLots.toNumber(),
        fresh:
          day(existing.currentPeriodLotsFrom) === live.window.from && day(existing.currentPeriodLotsTo) === live.window.to,
        asOf: existing.currentPeriodLotsAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load lots" }, { status: 502 });
  }
}
