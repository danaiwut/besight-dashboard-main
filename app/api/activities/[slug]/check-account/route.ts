import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { PARTNER_BROKER_CODES } from "@/lib/activities";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberScopeGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Pre-checks one of the member's own accounts for competition entry (the
 *  enroll endpoint re-validates everything — this is convenience only). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const { slug } = await params;
    const memberId = guard.memberId;
    const body = await request.json().catch(() => ({})) as { tradeAccountId?: number };
    const tradeAccountId = Number(body.tradeAccountId);
    if (!Number.isInteger(tradeAccountId) || tradeAccountId <= 0) {
      return NextResponse.json({ ok: false, error: "กรุณาเลือกบัญชี", code: "trade_account_required" }, { status: 400 });
    }
    const prisma = getPrisma();
    const activity = await prisma.activity.findFirst({ where: { slug, published: true }, select: { id: true, mode: true } });
    if (!activity) return NextResponse.json({ ok: false, error: "Activity not found" }, { status: 404 });
    if (activity.mode !== "registered") {
      return NextResponse.json({ ok: true, allowed: false, message: "กิจกรรมนี้ปิดรับสมัครแล้ว" });
    }
    const account = await prisma.tradeAccount.findFirst({
      where: { id: tradeAccountId, memberId },
      include: { broker: { select: { code: true, name: true } } },
    });
    if (!account) return NextResponse.json({ ok: true, allowed: false, message: "ไม่พบบัญชีนี้ในโปรไฟล์ของคุณ" });
    if (account.status !== "active") return NextResponse.json({ ok: true, allowed: false, message: "บัญชีนี้ไม่ได้ใช้งานอยู่" });
    if (!account.memberConfirmed) {
      return NextResponse.json({ ok: true, allowed: false, message: "กรุณายืนยันความเป็นเจ้าของบัญชีนี้ก่อน (หน้าโปรไฟล์)" });
    }
    if (!account.broker || !PARTNER_BROKER_CODES.includes(account.broker.code)) {
      return NextResponse.json({ ok: true, allowed: false, message: `ใช้ได้เฉพาะบัญชี ${PARTNER_BROKER_CODES.join("/")} ที่ลงทะเบียนกับ BeSight` });
    }
    const taken = await prisma.activityEnrollment.findFirst({
      where: { activityId: activity.id, tradeId: account.tradeId, NOT: { memberId } },
      select: { id: true },
    });
    if (taken) return NextResponse.json({ ok: true, allowed: false, message: `เลขบัญชี ${account.tradeId} ถูกใช้ลงทะเบียนในกิจกรรมนี้แล้ว` });
    return NextResponse.json({
      ok: true,
      allowed: true,
      message: `${account.broker.name} · ${account.tradeId} ใช้แข่งได้`,
      tradeId: account.tradeId,
      broker: account.broker.name,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "ตรวจสอบบัญชีไม่สำเร็จ" }, { status: 500 });
  }
}
