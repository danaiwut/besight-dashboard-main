import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { memberGuard } from "@/lib/session";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";

export const dynamic = "force-dynamic";

/** A member unlinks one of their OWN trade accounts. This is a SOFT unlink:
 *  the row is only un-confirmed (hidden from the dashboard) so the account's
 *  trade history and CRM records survive — a hard delete would cascade the
 *  member's TradeLog away. The member can re-claim it at any time. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const memberId = await resolveMemberIdForUser(guard.user);
  if (!memberId) {
    return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid account id" }, { status: 400 });

  try {
    const prisma = getPrisma();
    const account = await prisma.tradeAccount.findUnique({ where: { id }, select: { id: true, memberId: true } });
    if (!account) return NextResponse.json({ ok: false, error: "ไม่พบบัญชีนี้" }, { status: 404 });
    if (account.memberId !== memberId) {
      return NextResponse.json({ ok: false, error: "บัญชีนี้ไม่ใช่ของคุณ" }, { status: 403 });
    }
    await prisma.tradeAccount.update({ where: { id }, data: { memberConfirmed: false } });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "ลบบัญชีไม่สำเร็จ" }, { status: 500 });
  }
}
