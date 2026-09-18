import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { parseCourseBody, toCourseDto, uniqueCourseSlug } from "@/lib/server/courses";
import { adminWriteGuard } from "@/lib/session";


export const dynamic = "force-dynamic";

function fail(error: unknown, fallback: string, status = 400) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : fallback }, { status });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid course id" }, { status: 400 });
    const prisma = getPrisma();
    const existing = await prisma.course.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ ok: false, error: "Course not found" }, { status: 404 });

    const body = await request.json() as Record<string, unknown>;
    const data: Record<string, unknown> = parseCourseBody(body);
    if (data.slug !== undefined) {
      const desired = String(data.slug).trim();
      if (desired) data.slug = await uniqueCourseSlug(desired, id);
      else delete data.slug;
    }

    const course = await prisma.course.update({
      where: { id },
      data,
      include: { lessons: { select: { id: true, durationMin: true } }, _count: { select: { lessons: true } } },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, course: toCourseDto(course, 0, false) });
  } catch (error) {
    return fail(error, "Unable to update course");
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid course id" }, { status: 400 });
    const prisma = getPrisma();
    const existing = await prisma.course.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ ok: false, error: "Course not found" }, { status: 404 });

    // Learner progress must survive — a course with enrollments can only be unpublished.
    const enrollments = await prisma.courseEnrollment.count({ where: { courseId: id } });
    if (enrollments > 0) {
      return NextResponse.json(
        { ok: false, error: `คอร์สนี้มีผู้เรียนแล้ว ${enrollments} คน — ปิดเผยแพร่แทนการลบ`, code: "course_in_use" },
        { status: 409 },
      );
    }
    await prisma.course.delete({ where: { id } });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return fail(error, "Unable to delete course");
  }
}
