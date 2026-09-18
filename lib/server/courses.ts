import type { Course, CourseLesson } from "@/generated/prisma/client";
import type { CourseDetailDto, CourseDto, CourseLessonDto } from "../courses";
import { levelAtLeast, type MemberLevel } from "../memberLevel";
import { memberLevelFor } from "./memberLevel";
import { getPrisma } from "./prisma";

/* ── Course Online (LMS) read helpers ──
   Progress is always derived from LessonProgress rows, so a stored percentage
   can never drift from the lessons that actually make it up. */

type CourseWithLessons = Course & { lessons: Pick<CourseLesson, "id" | "durationMin">[]; _count?: { lessons: number } };

function lessonCountOf(course: CourseWithLessons) {
  return course._count?.lessons ?? course.lessons.length;
}

export function toCourseDto(
  course: CourseWithLessons,
  completedCount: number,
  enrolled: boolean,
  memberLevel: MemberLevel = "basic",
): CourseDto {
  const lessonCount = lessonCountOf(course);
  const lessonMinutes = course.lessons.reduce((sum, lesson) => sum + lesson.durationMin, 0);
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description || "",
    category: course.category,
    level: course.level,
    coverImage: course.coverImage || undefined,
    instructor: course.instructor || undefined,
    // Derived from the lessons when they exist; the column is a manual fallback.
    durationMin: lessonMinutes || course.durationMin,
    published: course.published,
    sortOrder: course.sortOrder,
    minLevel: course.minLevel,
    locked: !levelAtLeast(memberLevel, course.minLevel),
    memberLevel,
    lessonCount,
    completedCount,
    progressPct: lessonCount ? Math.round((completedCount / lessonCount) * 100) : 0,
    enrolled,
  };
}

export function toCourseLessonDto(lesson: CourseLesson, completed: boolean): CourseLessonDto {
  return {
    id: lesson.id,
    title: lesson.title,
    sectionTitle: lesson.sectionTitle || undefined,
    videoId: lesson.videoId || undefined,
    startSec: lesson.videoStart,
    endSec: lesson.videoEnd ?? null,
    script: lesson.script || undefined,
    durationMin: lesson.durationMin,
    sortOrder: lesson.sortOrder,
    isPreview: lesson.isPreview,
    completed,
  };
}

/** Lesson ids the member has completed, as a Set for O(1) lookups. */
export async function completedLessonIds(memberId: number | null): Promise<Set<number>> {
  if (!memberId) return new Set();
  const rows = await getPrisma().lessonProgress.findMany({ where: { memberId }, select: { lessonId: true } });
  return new Set(rows.map((row) => row.lessonId));
}

async function enrolledCourseIds(memberId: number | null): Promise<Set<number>> {
  if (!memberId) return new Set();
  const rows = await getPrisma().courseEnrollment.findMany({ where: { memberId }, select: { courseId: true } });
  return new Set(rows.map((row) => row.courseId));
}

/** Published catalog with each course's progress + the member's level. */
export async function listCourses(
  memberId: number | null,
  includeUnpublished = false,
): Promise<{ level: MemberLevel; courses: CourseDto[] }> {
  const prisma = getPrisma();
  const [courses, completed, enrolled, level] = await Promise.all([
    prisma.course.findMany({
      where: includeUnpublished ? {} : { published: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { lessons: { select: { id: true, durationMin: true } }, _count: { select: { lessons: true } } },
    }),
    completedLessonIds(memberId),
    enrolledCourseIds(memberId),
    memberId ? memberLevelFor(memberId) : Promise.resolve<MemberLevel>("basic"),
  ]);
  return {
    level,
    courses: courses.map((course) =>
      toCourseDto(course, course.lessons.filter((lesson) => completed.has(lesson.id)).length, enrolled.has(course.id), level),
    ),
  };
}

export async function courseDetail(slug: string, memberId: number | null): Promise<CourseDetailDto | null> {
  const prisma = getPrisma();
  const course = await prisma.course.findFirst({
    where: { slug, published: true },
    include: { lessons: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  });
  if (!course) return null;
  const [completed, enrolled, level] = await Promise.all([
    completedLessonIds(memberId),
    enrolledCourseIds(memberId),
    memberId ? memberLevelFor(memberId) : Promise.resolve<MemberLevel>("basic"),
  ]);
  const completedCount = course.lessons.filter((lesson) => completed.has(lesson.id)).length;
  return {
    ...toCourseDto(course, completedCount, enrolled.has(course.id), level),
    lessons: course.lessons.map((lesson) => toCourseLessonDto(lesson, completed.has(lesson.id))),
  };
}

/** Marks a course complete once every lesson is done (and re-opens it if a
 *  lesson is un-ticked), keeping CourseEnrollment.completedAt truthful. */
export async function syncCourseCompletion(courseId: number, memberId: number): Promise<boolean> {
  const prisma = getPrisma();
  const [lessons, completed] = await Promise.all([
    prisma.courseLesson.count({ where: { courseId } }),
    prisma.lessonProgress.count({ where: { memberId, lesson: { courseId } } }),
  ]);
  const done = lessons > 0 && completed >= lessons;
  await prisma.courseEnrollment.updateMany({
    where: { courseId, memberId },
    data: { completedAt: done ? new Date() : null },
  });
  return done;
}

/* ── Admin write helpers ── */

function slugifyCourse(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function uniqueCourseSlug(desired: string, excludeId?: number) {
  const prisma = getPrisma();
  const base = slugifyCourse(desired) || `course-${Date.now().toString(36)}`;
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await prisma.course.findUnique({ where: { slug }, select: { id: true } });
    if (!clash || clash.id === excludeId) return slug;
  }
  throw new Error("Unable to generate a unique course slug");
}

export function parseCourseBody(body: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) throw new Error("Course title is required");
    data.title = title;
  }
  if (body.slug !== undefined) data.slug = String(body.slug).trim();
  if (body.description !== undefined) data.description = String(body.description).trim() || null;
  if (body.category !== undefined) data.category = String(body.category).trim() || "beginner";
  if (body.level !== undefined) {
    const level = String(body.level);
    if (!["beginner", "intermediate", "advanced"].includes(level)) throw new Error("Invalid level");
    data.level = level;
  }
  if (body.minLevel !== undefined) {
    const minLevel = String(body.minLevel);
    if (!["basic", "standard", "premium"].includes(minLevel)) throw new Error("Invalid minimum level");
    data.minLevel = minLevel;
  }
  if (body.coverImage !== undefined) data.coverImage = String(body.coverImage).trim() || null;
  if (body.instructor !== undefined) data.instructor = String(body.instructor).trim() || null;
  if (body.sortOrder !== undefined) data.sortOrder = Math.floor(Number(body.sortOrder) || 0);
  if (body.published !== undefined) data.published = Boolean(body.published);
  return data;
}

/** Accepts seconds ("540") or a clock string ("9:00" / "1:02:30"). */
export function parseTimecode(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.max(0, Math.floor(Number(raw)));
  const parts = raw.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  return Math.max(0, Math.floor(parts.reduce((total, part) => total * 60 + part, 0)));
}

export function parseLessonBody(body: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) throw new Error("Lesson title is required");
    data.title = title;
  }
  if (body.videoId !== undefined) {
    const raw = String(body.videoId).trim();
    // Accept a full YouTube URL too — only the 11-char id is stored.
    const match = raw.match(/[?&]v=([\w-]{6,})|youtu\.be\/([\w-]{6,})|\/embed\/([\w-]{6,})|\/shorts\/([\w-]{6,})/);
    data.videoId = (match ? match[1] || match[2] || match[3] || match[4] : raw) || null;
  }
  if (body.sectionTitle !== undefined) data.sectionTitle = String(body.sectionTitle).trim() || null;
  if (body.script !== undefined) data.script = String(body.script).trim() || null;
  if (body.startSec !== undefined || body.videoStart !== undefined) {
    data.videoStart = parseTimecode(body.startSec ?? body.videoStart) ?? 0;
  }
  if (body.endSec !== undefined || body.videoEnd !== undefined) {
    data.videoEnd = parseTimecode(body.endSec ?? body.videoEnd);
  }
  if (body.durationMin !== undefined) data.durationMin = Math.max(0, Math.floor(Number(body.durationMin) || 0));
  if (body.sortOrder !== undefined) data.sortOrder = Math.floor(Number(body.sortOrder) || 0);
  if (body.isPreview !== undefined) data.isPreview = Boolean(body.isPreview);

  // A chapter range defines the runtime — keep durationMin honest unless the
  // caller explicitly set one.
  const start = typeof data.videoStart === "number" ? data.videoStart : undefined;
  const end = typeof data.videoEnd === "number" ? data.videoEnd : undefined;
  if (body.durationMin === undefined && start !== undefined && end !== undefined && end > start) {
    data.durationMin = Math.max(1, Math.round((end - start) / 60));
  }
  return data;
}

/** Admin preview: the same DTO the customer page renders, but ignoring publish
 *  state and level locks — the admin always sees the full course. */
export async function courseDetailForAdmin(id: number): Promise<CourseDetailDto | null> {
  const course = await getPrisma().course.findUnique({
    where: { id },
    include: { lessons: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  });
  if (!course) return null;
  return {
    ...toCourseDto(course, 0, false, "premium"),
    lessons: course.lessons.map((lesson) => toCourseLessonDto(lesson, false)),
  };
}
