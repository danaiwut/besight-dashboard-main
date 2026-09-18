import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { parseCourseBody, toCourseDto, uniqueCourseSlug } from "@/lib/server/courses";
import { adminGuard, adminWriteGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

function fail(error: unknown, fallback: string, status = 400) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : fallback }, { status });
}

/** Every course (published or not) with its lesson count. */
export async function GET() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const records = await getPrisma().course.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { lessons: { select: { id: true, durationMin: true } }, _count: { select: { lessons: true } } },
    });
    return NextResponse.json({ ok: true, courses: records.map((course) => toCourseDto(course, 0, false)) });
  } catch (error) {
    return fail(error, "Unable to load courses", 500);
  }
}

export async function POST(request: NextRequest) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const data = parseCourseBody(body);
    if (!data.title) return NextResponse.json({ ok: false, error: "Course title is required" }, { status: 400 });

    const prisma = getPrisma();
    const slug = await uniqueCourseSlug(String(data.slug || "") || String(data.title));
    const course = await prisma.course.create({
      data: {
        slug,
        title: data.title as string,
        description: (data.description as string | null) ?? null,
        category: (data.category as string) ?? "beginner",
        level: (data.level as "beginner" | "intermediate" | "advanced") ?? "beginner",
        minLevel: (data.minLevel as "basic" | "standard" | "premium") ?? "basic",
        coverImage: (data.coverImage as string | null) ?? null,
        instructor: (data.instructor as string | null) ?? null,
        sortOrder: (data.sortOrder as number) ?? 0,
        published: (data.published as boolean) ?? true,
      },
      include: { lessons: { select: { id: true, durationMin: true } }, _count: { select: { lessons: true } } },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, course: toCourseDto(course, 0, false) });
  } catch (error) {
    return fail(error, "Unable to create course");
  }
}
