import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { snapshotOneMemberLots } from "@/lib/server/memberLotsSync";
import type { LotPeriod } from "@/lib/lotCycle";
import { toMemberDto } from "@/lib/server/crmDtos";
import { adminWriteGuard } from "@/lib/session";


export const dynamic = "force-dynamic";

const PERIODS: LotPeriod[] = ["cycle", "entitlement", "month"];

/** On-demand fresh lots for one member. Defaults to the current monthly cycle
 *  but the admin can pick the whole entitlement window or the calendar month.
 *  Persists the window stamp so list and detail converge on the same number. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid member id" }, { status: 400 });
    const body = await request.json().catch(() => ({})) as { period?: string };
    const period: LotPeriod = PERIODS.includes(body.period as LotPeriod) ? body.period as LotPeriod : "cycle";
    const prisma = getPrisma();
    const existing = await prisma.member.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });

    const total = await snapshotOneMemberLots(id, period);
    const member = await prisma.member.findUnique({
      where: { id },
      include: { acquisitionChannels: true, tradeAccounts: true },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, member: toMemberDto(member!), totalLots: total });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to refresh lots" }, { status: 502 });
  }
}
