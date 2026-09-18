import { NextRequest, NextResponse } from "next/server";
import { ActivityStatus } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toActivityDto } from "@/lib/server/crmDtos";
import { accountKindMessage, classifyCompetitionAccount } from "@/lib/server/activityScoring";
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

/** Loads a visible activity (with its live registration count) plus whether
 *  the signed-in member is registered. */
async function loadActivity(slug: string, memberId: number | null) {
  const prisma = getPrisma();
  const activity = await prisma.activity.findFirst({
    where: { slug, ...visibleWhere() },
    include: { _count: { select: { enrollments: true } } },
  });
  if (!activity) return null;
  const enrolled = memberId
    ? Boolean(await prisma.activityEnrollment.findUnique({ where: { activityId_memberId: { activityId: activity.id, memberId } }, select: { id: true } }))
    : false;
  return toActivityDto(activity, enrolled, registrationOpenOf(activity));
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

/** Registers the signed-in member with the DEMO account they'll compete on.
 *  A number that shows up in the BeSight live campaign data is a real account
 *  and is rejected — this competition is demo-only. Demo registrations stay
 *  `verifiedAt = null` until a demo lot source exists. */
export async function POST(request: NextRequest, { params }: Params) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const { slug } = await params;
    const memberId = await resolveMemberIdForUser(guard.user);
    if (!memberId) return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });

    const body = await request.json().catch(() => ({})) as { tradeId?: string };
    const tradeId = String(body.tradeId || "").trim();
    if (!tradeId) return NextResponse.json({ ok: false, error: "กรุณาระบุเลขบัญชี demo ที่ใช้แข่ง", code: "trade_id_required" }, { status: 400 });

    const prisma = getPrisma();
    const activity = await prisma.activity.findFirst({
      where: { slug, ...visibleWhere() },
      select: { id: true, status: true, registrationOpensAt: true },
    });
    if (!activity) return NextResponse.json({ ok: false, error: "Activity not found" }, { status: 404 });
    if (activity.status === ActivityStatus.finished) {
      return NextResponse.json({ ok: false, error: "กิจกรรมนี้สิ้นสุดแล้ว", code: "activity_finished" }, { status: 409 });
    }
    if (!registrationOpenOf(activity)) {
      return NextResponse.json({ ok: false, error: "ยังไม่เปิดรับลงทะเบียนสำหรับกิจกรรมนี้", code: "registration_not_open" }, { status: 409 });
    }

    // One competition account belongs to a single member per activity.
    const taken = await prisma.activityEnrollment.findFirst({
      where: { activityId: activity.id, tradeId, NOT: { memberId } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json({ ok: false, error: `เลขบัญชี ${tradeId} ถูกใช้ลงทะเบียนในกิจกรรมนี้แล้ว`, code: "activity_account_taken" }, { status: 409 });
    }

    // A verified XM account already linked to the CRM is a real account.
    const linked = await prisma.tradeAccount.findFirst({
      where: { memberId, tradeId, status: "active" },
      include: { broker: { select: { code: true } } },
    });
    if (linked && linked.broker?.code === "XM" && linked.verification === "verified") {
      return NextResponse.json(
        { ok: false, error: "บัญชีนี้เป็นบัญชีจริงที่ผูกกับโปรไฟล์ของคุณ — กิจกรรมนี้ใช้ได้เฉพาะบัญชี demo", code: "live_account_not_allowed" },
        { status: 409 },
      );
    }

    // Not in the live campaign data → treat as a demo account.
    const kind = await classifyCompetitionAccount(tradeId);
    if (kind === "live") {
      return NextResponse.json(
        { ok: false, error: "บัญชีนี้เป็นบัญชีจริง (พบในระบบเทรดของ BeSight) — กิจกรรมนี้ใช้ได้เฉพาะบัญชี demo", code: "live_account_not_allowed" },
        { status: 409 },
      );
    }

    await prisma.activityEnrollment.upsert({
      where: { activityId_memberId: { activityId: activity.id, memberId } },
      update: { tradeAccountId: null, tradeId, isDemo: true, verifiedAt: null, verificationNote: accountKindMessage(kind) },
      create: { activityId: activity.id, memberId, tradeAccountId: null, tradeId, isDemo: true, verifiedAt: null, verificationNote: accountKindMessage(kind) },
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
