import { NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { adminGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Enrollment and per-learner progress for the CRM course editor. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  try {
    const courseId = Number((await params).id);
    if (!Number.isInteger(courseId) || courseId <= 0) return NextResponse.json({ ok: false, error: "Invalid course id" }, { status: 400 });
    const prisma = getPrisma();
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, lessons: { select: { id: true, title: true, sortOrder: true } } },
    });
    if (!course) return NextResponse.json({ ok: false, error: "Course not found" }, { status: 404 });

    const [enrollments, progress] = await Promise.all([
      prisma.courseEnrollment.findMany({
        where: { courseId },
        orderBy: { startedAt: "desc" },
        include: { member: { select: { id: true, name: true, displayName: true, email: true, avatarUrl: true, code: true } } },
      }),
      prisma.lessonProgress.findMany({
        where: { lesson: { courseId } },
        select: { memberId: true, completedAt: true, lesson: { select: { title: true, sortOrder: true } } },
        orderBy: { completedAt: "desc" },
      }),
    ]);

    const byMember = new Map<number, typeof progress>();
    for (const item of progress) byMember.set(item.memberId, [...(byMember.get(item.memberId) ?? []), item]);
    const lessonCount = course.lessons.length;
    const learners = enrollments.map((enrollment) => {
      const completed = byMember.get(enrollment.memberId) ?? [];
      const latest = completed[0];
      return {
        member: enrollment.member,
        enrolledAt: enrollment.startedAt,
        completedAt: enrollment.completedAt,
        completedLessons: completed.length,
        lessonCount,
        progressPct: lessonCount ? Math.round((completed.length / lessonCount) * 100) : 0,
        lastLesson: latest?.lesson.title ?? null,
        lastActivityAt: latest?.completedAt ?? enrollment.startedAt,
      };
    });
    return NextResponse.json({
      ok: true,
      summary: { enrolled: learners.length, completed: learners.filter((learner) => learner.completedAt).length, lessonCount },
      learners,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load learner progress" }, { status: 500 });
  }
}
