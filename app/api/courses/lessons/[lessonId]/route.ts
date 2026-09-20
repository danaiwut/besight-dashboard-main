import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberScopeGuard } from "@/lib/session";
import { syncCourseCompletion, watchGateFor } from "@/lib/server/courses";
import { WATCH_COMPLETE_PCT } from "@/lib/courses";
import { memberLevelFor } from "@/lib/server/memberLevel";
import { levelAtLeast } from "@/lib/memberLevel";

export const dynamic = "force-dynamic";

/** Ticks / un-ticks one lesson for the signed-in member. Completing the first
 *  lesson enrols them automatically, and the enrollment's completedAt is kept
 *  in sync with the lesson rows. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = guard.memberId;

    const lessonId = Number((await params).lessonId);
    if (!Number.isInteger(lessonId) || lessonId <= 0) return NextResponse.json({ ok: false, error: "Invalid lesson id" }, { status: 400 });

    const body = await request.json().catch(() => ({})) as { completed?: boolean };
    const completed = body.completed !== false;

    const prisma = getPrisma();
    const lesson = await prisma.courseLesson.findUnique({
      where: { id: lessonId },
      select: { id: true, courseId: true, videoId: true, videoStart: true, videoEnd: true, course: { select: { published: true, minLevel: true } } },
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

    let watchedPct: number | null = null;
    if (completed) {
      // Watch gate: video lessons need ≥90% watched (reading-only lessons
      // are always tickable). The player sends heartbeats; this is verified
      // server-side so a bare API call can't skip ahead.
      const gate = await watchGateFor(memberId, {
        id: lesson.id, videoId: lesson.videoId, videoStart: lesson.videoStart, videoEnd: lesson.videoEnd,
      });
      watchedPct = gate.watchedPct;
      if (!gate.allowed) {
        return NextResponse.json(
          { ok: false, error: `ดูวิดีโอนี้ให้ถึง ${WATCH_COMPLETE_PCT}% ก่อน (ดูแล้ว ${gate.watchedPct ?? 0}%)`, code: "watch_required", watchedPct: gate.watchedPct },
          { status: 409 },
        );
      }
      await prisma.lessonProgress.upsert({
        where: { lessonId_memberId: { lessonId, memberId } },
        update: { completedAt: new Date() },
        create: { lessonId, memberId, completedAt: new Date() },
      });
    } else {
      await prisma.lessonProgress.deleteMany({ where: { lessonId, memberId } });
    }

    const courseCompleted = await syncCourseCompletion(lesson.courseId, memberId);
    await bumpDataVersion();
    return NextResponse.json({ ok: true, completed, courseCompleted, watchedPct });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "อัปเดตความคืบหน้าไม่สำเร็จ" }, { status: 400 });
  }
}
