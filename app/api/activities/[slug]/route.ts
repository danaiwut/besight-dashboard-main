import { NextRequest, NextResponse } from "next/server";
import { ActivityStatus } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toActivityDto } from "@/lib/server/crmDtos";
import { PARTNER_BROKER_CODES } from "@/lib/activities";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

function fail(error: unknown, fallback: string, status = 500) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : fallback }, { status });
}

/** An activity is visible once published AND past its optional visibleFrom date. */
function visibleWhere() {
  return { published: true, OR: [{ visibleFrom: null }, { visibleFrom: { lte: new Date() } }] };
}

function registrationOpenOf(activity: { registrationOpensAt: Date | null }) {
  return !activity.registrationOpensAt || activity.registrationOpensAt.getTime() <= Date.now();
}

/** Loads a visible activity (with its live registration count, prize table and
 *  the signed-in member's registration) plus whether the member is registered. */
async function loadActivity(slug: string, memberId: number | null) {
  const prisma = getPrisma();
  const activity = await prisma.activity.findFirst({
    where: { slug, ...visibleWhere() },
    include: {
      _count: { select: { enrollments: true } },
      prizes: { orderBy: [{ sortOrder: "asc" }, { rankFrom: "asc" }] },
    },
  });
  if (!activity) return null;
  const enrollment = memberId
    ? await prisma.activityEnrollment.findUnique({
        where: { activityId_memberId: { activityId: activity.id, memberId } },
        select: { id: true, tradeId: true },
      })
    : null;
  return toActivityDto(activity, Boolean(enrollment), registrationOpenOf(activity), {
    enrolledTradeId: enrollment?.tradeId ?? undefined,
  });
}

/** Customer-facing detail: visible activity by slug. */
export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const { slug } = await params;
    const memberId = await resolveMemberIdForUser(guard.user);
    const activity = await loadActivity(slug, memberId);
    if (!activity) return NextResponse.json({ ok: false, error: "Activity not found" }, { status: 404 });
    return NextResponse.json({ ok: true, activity });
  } catch (error) {
    return fail(error, "Unable to load activity");
  }
}

/** Registers the signed-in member with one of their OWN registered trade
 *  accounts (partner broker, active, ownership-confirmed). Standings count
 *  that account's lots over the activity window via the lot webhook.
 *  Legacy demo competitions are frozen: viewable, no new enrollments. */
export async function POST(request: NextRequest, { params }: Params) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const { slug } = await params;
    const memberId = await resolveMemberIdForUser(guard.user);
    if (!memberId) return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });

    const body = await request.json().catch(() => ({})) as { tradeAccountId?: number };
    const tradeAccountId = Number(body.tradeAccountId);
    if (!Number.isInteger(tradeAccountId) || tradeAccountId <= 0) {
      return NextResponse.json({ ok: false, error: "กรุณาเลือกบัญชีเทรดที่ใช้แข่ง", code: "trade_account_required" }, { status: 400 });
    }

    const prisma = getPrisma();
    const activity = await prisma.activity.findFirst({
      where: { slug, ...visibleWhere() },
      select: { id: true, mode: true, status: true, registrationOpensAt: true },
    });
    if (!activity) return NextResponse.json({ ok: false, error: "Activity not found" }, { status: 404 });
    if (activity.mode !== "registered") {
      return NextResponse.json({ ok: false, error: "กิจกรรมนี้ปิดรับสมัครแล้ว", code: "activity_frozen" }, { status: 409 });
    }
    if (activity.status === ActivityStatus.finished) {
      return NextResponse.json({ ok: false, error: "กิจกรรมนี้สิ้นสุดแล้ว", code: "activity_finished" }, { status: 409 });
    }
    if (!registrationOpenOf(activity)) {
      return NextResponse.json({ ok: false, error: "ยังไม่เปิดรับลงทะเบียนสำหรับกิจกรรมนี้", code: "registration_not_open" }, { status: 409 });
    }

    // Must be the member's own account: active, ownership-confirmed, partner broker.
    const account = await prisma.tradeAccount.findFirst({
      where: { id: tradeAccountId, memberId },
      include: { broker: { select: { code: true, name: true } } },
    });
    if (!account) return NextResponse.json({ ok: false, error: "ไม่พบบัญชีเทรดนี้ในโปรไฟล์ของคุณ", code: "account_not_found" }, { status: 404 });
    if (account.status !== "active") {
      return NextResponse.json({ ok: false, error: "บัญชีนี้ไม่ได้ใช้งานอยู่", code: "account_inactive" }, { status: 409 });
    }
    if (!account.memberConfirmed) {
      return NextResponse.json({ ok: false, error: "กรุณายืนยันความเป็นเจ้าของบัญชีนี้ก่อน (หน้าโปรไฟล์)", code: "account_unconfirmed" }, { status: 409 });
    }
    if (!account.broker || !PARTNER_BROKER_CODES.includes(account.broker.code)) {
      return NextResponse.json(
        { ok: false, error: `กิจกรรมนี้ใช้ได้เฉพาะบัญชี ${PARTNER_BROKER_CODES.join("/")} ที่ลงทะเบียนกับ BeSight`, code: "broker_not_allowed" },
        { status: 409 },
      );
    }

    // One competition account belongs to a single member per activity.
    const taken = await prisma.activityEnrollment.findFirst({
      where: { activityId: activity.id, tradeId: account.tradeId, NOT: { memberId } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json({ ok: false, error: `เลขบัญชี ${account.tradeId} ถูกใช้ลงทะเบียนในกิจกรรมนี้แล้ว`, code: "activity_account_taken" }, { status: 409 });
    }

    await prisma.activityEnrollment.upsert({
      where: { activityId_memberId: { activityId: activity.id, memberId } },
      update: { tradeAccountId: account.id, tradeId: account.tradeId, isDemo: false, verifiedAt: new Date(), verificationNote: null },
      create: { activityId: activity.id, memberId, tradeAccountId: account.id, tradeId: account.tradeId, isDemo: false, verifiedAt: new Date() },
    });
    await bumpDataVersion();
    const updated = await loadActivity(slug, memberId);
    return NextResponse.json({ ok: true, activity: updated });
  } catch (error) {
    // Unique(activityId, tradeId) race: the friendly duplicate message, not a 500.
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ ok: false, error: "เลขบัญชีนี้ถูกใช้ลงทะเบียนในกิจกรรมนี้แล้ว", code: "activity_account_taken" }, { status: 409 });
    }
    return fail(error, "ลงทะเบียนไม่สำเร็จ", 400);
  }
}

/** Cancel the signed-in member's registration. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const { slug } = await params;
    const memberId = await resolveMemberIdForUser(guard.user);
    if (!memberId) return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });

    const prisma = getPrisma();
    const activity = await prisma.activity.findFirst({ where: { slug, ...visibleWhere() }, select: { id: true } });
    if (!activity) return NextResponse.json({ ok: false, error: "Activity not found" }, { status: 404 });

    await prisma.activityEnrollment.deleteMany({ where: { activityId: activity.id, memberId } });
    await bumpDataVersion();
    const updated = await loadActivity(slug, memberId);
    return NextResponse.json({ ok: true, activity: updated });
  } catch (error) {
    return fail(error, "ยกเลิกการลงทะเบียนไม่สำเร็จ", 400);
  }
}
