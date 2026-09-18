import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberGuard } from "@/lib/session";
import { courseDetail } from "@/lib/server/courses";
import { memberLevelFor } from "@/lib/server/memberLevel";
import { levelAtLeast, MEMBER_LEVEL_LABEL_KEYS } from "@/lib/memberLevel";

export const dynamic = "force-dynamic";

/** Enrols the signed-in member in a published course (idempotent). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const { slug } = await params;
    const memberId = await resolveMemberIdForUser(guard.user);
    if (!memberId) return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });

    const prisma = getPrisma();
    const course = await prisma.course.findFirst({ where: { slug, published: true }, select: { id: true, minLevel: true } });
    if (!course) return NextResponse.json({ ok: false, error: "Course not found" }, { status: 404 });

    // Level gate: the course's minLevel must be met before enrolling.
    const level = await memberLevelFor(memberId);
    if (!levelAtLeast(level, course.minLevel)) {
      return NextResponse.json(
        { ok: false, error: `คอร์สนี้เปิดให้สมาชิกระดับ ${course.minLevel.toUpperCase()} ขึ้นไป (ระดับของคุณ: ${level})`, code: "level_required", required: course.minLevel, level, labelKey: MEMBER_LEVEL_LABEL_KEYS[course.minLevel] },
        { status: 403 },
      );
    }

    await prisma.courseEnrollment.upsert({
      where: { courseId_memberId: { courseId: course.id, memberId } },
      update: {},
      create: { courseId: course.id, memberId },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, course: await courseDetail(slug, memberId) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "ลงทะเบียนเรียนไม่สำเร็จ" }, { status: 400 });
  }
}
