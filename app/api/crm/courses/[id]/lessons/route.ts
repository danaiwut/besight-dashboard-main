import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { courseDetailForAdmin, parseCourseBody, parseLessonBody, toCourseLessonDto, uniqueCourseSlug } from "@/lib/server/courses";
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
    return NextResponse.json({ ok: true, course, lessons: lessons.map((lesson) => toCourseLessonDto(lesson, { completed: false, maxPositionSec: 0, durationSec: null })) });
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
    return NextResponse.json({ ok: true, lesson: toCourseLessonDto(lesson, { completed: false, maxPositionSec: 0, durationSec: null }) });
  } catch (error) {
    return fail(error, "Unable to create lesson");
  }
}

/** Batch save: course fields + the full lesson list (updates, creates and
 *  deletions) in one transaction — the editor's single Save button. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    const prisma = getPrisma();
    const existing = await prisma.course.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ ok: false, error: "Course not found" }, { status: 404 });

    const body = await request.json() as {
      course?: Record<string, unknown>;
      lessons?: Array<Record<string, unknown>>;
      removedIds?: number[];
    };
    if (!Array.isArray(body.lessons)) return NextResponse.json({ ok: false, error: "lessons must be an array" }, { status: 400 });

    const courseData: Record<string, unknown> = body.course ? parseCourseBody(body.course) : {};
    if (courseData.slug !== undefined) {
      const desired = String(courseData.slug).trim();
      if (desired) courseData.slug = await uniqueCourseSlug(desired, id);
      else delete courseData.slug;
    }

    const removedIds = [...new Set((body.removedIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    const ownedIds = new Set(
      (await prisma.courseLesson.findMany({ where: { courseId: id }, select: { id: true } })).map((row) => row.id),
    );
    for (const removedId of removedIds) {
      if (!ownedIds.has(removedId)) return NextResponse.json({ ok: false, error: `Lesson ${removedId} does not belong to this course` }, { status: 400 });
    }

    const parsed = body.lessons.map((raw, index) => {
      const data = parseLessonBody(raw);
      const lessonId = Number(raw.id);
      const owned = Number.isInteger(lessonId) && lessonId > 0 ? lessonId : null;
      if (owned && !ownedIds.has(owned)) throw new Error(`Lesson ${owned} does not belong to this course`);
      if (!owned && !data.title) throw new Error(`Lesson #${index + 1}: title is required`);
      return {
        id: owned,
        data: { ...data, sortOrder: data.sortOrder ?? index, durationMin: data.durationMin ?? 0 } as Record<string, unknown>,
      };
    });

    await prisma.$transaction(async (tx) => {
      if (Object.keys(courseData).length) await tx.course.update({ where: { id }, data: courseData });
      if (removedIds.length) await tx.courseLesson.deleteMany({ where: { id: { in: removedIds }, courseId: id } });
      for (const row of parsed) {
        if (row.id) {
          await tx.courseLesson.update({ where: { id: row.id }, data: row.data });
        } else {
          await tx.courseLesson.create({
            data: {
              courseId: id,
              title: String(row.data.title),
              videoId: (row.data.videoId as string | null) ?? null,
              sectionTitle: (row.data.sectionTitle as string | null) ?? null,
              script: (row.data.script as string | null) ?? null,
              videoStart: (row.data.videoStart as number) ?? 0,
              videoEnd: (row.data.videoEnd as number | null) ?? null,
              durationMin: (row.data.durationMin as number) ?? 0,
              sortOrder: (row.data.sortOrder as number) ?? 0,
              isPreview: Boolean(row.data.isPreview),
            },
          });
        }
      }
    });

    const course = await courseDetailForAdmin(id);
    await bumpDataVersion();
    return NextResponse.json({ ok: true, course });
  } catch (error) {
    return fail(error, "Unable to save course");
  }
}
