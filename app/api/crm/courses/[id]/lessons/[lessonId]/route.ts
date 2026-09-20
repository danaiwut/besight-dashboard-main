import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { parseLessonBody, toCourseLessonDto } from "@/lib/server/courses";
import { adminWriteGuard } from "@/lib/session";


export const dynamic = "force-dynamic";

function fail(error: unknown, fallback: string, status = 400) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : fallback }, { status });
}

async function findLesson(courseId: number, lessonId: number) {
  if (!Number.isInteger(courseId) || courseId <= 0 || !Number.isInteger(lessonId) || lessonId <= 0) return null;
  const lesson = await getPrisma().courseLesson.findUnique({ where: { id: lessonId }, select: { id: true, courseId: true } });
  return lesson && lesson.courseId === courseId ? lesson : null;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const courseId = Number((await params).id);
    const lessonId = Number((await params).lessonId);
    if (!(await findLesson(courseId, lessonId))) return NextResponse.json({ ok: false, error: "Lesson not found" }, { status: 404 });

    const body = await request.json() as Record<string, unknown>;
    const data: Record<string, unknown> = parseLessonBody(body);
    const lesson = await getPrisma().courseLesson.update({ where: { id: lessonId }, data });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, lesson: toCourseLessonDto(lesson, { completed: false, maxPositionSec: 0, durationSec: null }) });
  } catch (error) {
    return fail(error, "Unable to update lesson");
  }
}

/** Removing a lesson also removes its progress rows (cascade); enrollments and
 *  the course itself are untouched. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const courseId = Number((await params).id);
    const lessonId = Number((await params).lessonId);
    if (!(await findLesson(courseId, lessonId))) return NextResponse.json({ ok: false, error: "Lesson not found" }, { status: 404 });
    await getPrisma().courseLesson.delete({ where: { id: lessonId } });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, id: lessonId });
  } catch (error) {
    return fail(error, "Unable to delete lesson");
  }
}
