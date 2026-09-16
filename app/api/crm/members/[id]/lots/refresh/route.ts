import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { snapshotOneMemberLots } from "@/lib/server/memberLotsSync";
import { toMemberDto } from "@/lib/server/crmDtos";

export const dynamic = "force-dynamic";

/** On-demand fresh lots for one member: recomputes live over the member's
 *  CURRENT qualification window, persists it (with the window stamp), and
 *  returns the updated member — list and detail converge on the same number. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid member id" }, { status: 400 });
    const prisma = getPrisma();
    const existing = await prisma.member.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });

    const total = await snapshotOneMemberLots(id);
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
