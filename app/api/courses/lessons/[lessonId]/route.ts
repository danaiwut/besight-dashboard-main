import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberGuard } from "@/lib/session";
import { syncCourseCompletion } from "@/lib/server/courses";
import { memberLevelFor } from "@/lib/server/memberLevel";
import { levelAtLeast } from "@/lib/memberLevel";

export const dynamic = "force-dynamic";

/** Ticks / un-ticks one lesson for the signed-in member. Completing the first
 *  lesson enrols them automatically, and the enrollment's completedAt is kept
 *  in sync with the lesson rows. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = await resolveMemberIdForUser(guard.user);
    if (!memberId) return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });

    const lessonId = Number((await params).lessonId);
    if (!Number.isInteger(lessonId) || lessonId <= 0) return NextResponse.json({ ok: false, error: "Invalid lesson id" }, { status: 400 });

    const body = await request.json().catch(() => ({})) as { completed?: boolean };
    const completed = body.completed !== false;

    const prisma = getPrisma();
    const lesson = await prisma.courseLesson.findUnique({
      where: { id: lessonId },
      select: { id: true, courseId: true, course: { select: { published: true, minLevel: true } } },
    });
    if (!lesson || !lesson.course.published) return NextResponse.json({ ok: false, error: "Lesson not found" }, { status: 404 });

    // Same level gate as enrolling — completing a lesson must not bypass it.
    const level = await memberLevelFor(memberId);
    if (!levelAtLeast(level, lesson.course.minLevel)) {
      return NextResponse.json({ ok: false, error: "ระดับสมาชิกของคุณยังไม่ถึงเกณฑ์ของคอร์สนี้", code: "level_required" }, { status: 403 });
    }

    await prisma.courseEnrollment.upsert({
      where: { courseId_memberId: { courseId: lesson.courseId, memberId } },
      update: {},
      create: { courseId: lesson.courseId, memberId },
    });

    if (completed) {
      await prisma.lessonProgress.upsert({
        where: { lessonId_memberId: { lessonId, memberId } },
        update: {},
        create: { lessonId, memberId },
      });
    } else {
      await prisma.lessonProgress.deleteMany({ where: { lessonId, memberId } });
    }

    const courseCompleted = await syncCourseCompletion(lesson.courseId, memberId);
    await bumpDataVersion();
    return NextResponse.json({ ok: true, completed, courseCompleted });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "อัปเดตความคืบหน้าไม่สำเร็จ" }, { status: 400 });
  }
}
