import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { parseLessonBody, toCourseLessonDto } from "@/lib/server/courses";
import { adminGuard, adminWriteGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

function fail(error: unknown, fallback: string, status = 400) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : fallback }, { status });
}

async function findCourse(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  return getPrisma().course.findUnique({ where: { id }, select: { id: true, title: true } });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    const course = await findCourse(id);
    if (!course) return NextResponse.json({ ok: false, error: "Course not found" }, { status: 404 });
    const lessons = await getPrisma().courseLesson.findMany({ where: { courseId: id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    return NextResponse.json({ ok: true, course, lessons: lessons.map((lesson) => toCourseLessonDto(lesson, false)) });
  } catch (error) {
    return fail(error, "Unable to load lessons", 500);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    const course = await findCourse(id);
    if (!course) return NextResponse.json({ ok: false, error: "Course not found" }, { status: 404 });

    const body = await request.json() as Record<string, unknown>;
    const data = parseLessonBody(body);
    if (!data.title) return NextResponse.json({ ok: false, error: "Lesson title is required" }, { status: 400 });

    const prisma = getPrisma();
    const count = await prisma.courseLesson.count({ where: { courseId: id } });
    const lesson = await prisma.courseLesson.create({
      data: {
        courseId: id,
        title: data.title as string,
        videoId: (data.videoId as string | null) ?? null,
        durationMin: (data.durationMin as number) ?? 0,
        sortOrder: (data.sortOrder as number) ?? count,
        isPreview: (data.isPreview as boolean) ?? false,
      },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, lesson: toCourseLessonDto(lesson, false) });
  } catch (error) {
    return fail(error, "Unable to create lesson");
  }
}
