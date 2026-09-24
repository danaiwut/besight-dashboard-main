/** Course Online (LMS): shared client-safe types. The database is the only
 *  source of course content (admin-authored in the CRM) — nothing is seeded.
 *  Import-safe on both client and server (no Prisma import). */

import type { MemberLevel } from "./memberLevel";

export type Category = "all" | "beginner" | "technical" | "risk" | "psychology" | "strategy";

export const TABS: Category[] = ["all", "beginner", "technical", "risk", "psychology", "strategy"];

export type CourseLevel = "beginner" | "intermediate" | "advanced";
export const COURSE_LEVELS: CourseLevel[] = ["beginner", "intermediate", "advanced"];

export type CourseLessonDto = {
  id: number;
  title: string;
  /** Optional curriculum section this lesson is grouped under. */
  sectionTitle?: string;
  videoId?: string;
  /** Chapter range inside the video, in seconds (endSec null = play to the end). */
  startSec: number;
  endSec: number | null;
  /** Lesson script / notes shown under the video. */
  script?: string;
  durationMin: number;
  sortOrder: number;
  isPreview: boolean;
  completed: boolean;
  /** Watch state (0-100). Absent when nothing has been watched yet. */
  watchedPct?: number;
  /** True when the server stripped this lesson's video (preview lock). */
  locked?: boolean;
};

/** A lesson counts as watched-through at this percentage of its effective
 *  range (chapter start → chapter end, or full video when open-ended). */
export const WATCH_COMPLETE_PCT = 90;

/** Watched % over the lesson's effective range, or null when it can't be
 *  computed yet (duration still unknown and no explicit chapter end).
 *  positionSec/durationSec are the absolute video clock (as the IFrame API
 *  reports them), NOT chapter-relative. */
export function watchedPctOf(
  positionSec: number,
  durationSec: number | null,
  startSec: number,
  endSec: number | null,
): number | null {
  const start = Math.max(0, Math.floor(startSec));
  const end = endSec ?? durationSec;
  if (end == null || end <= start) return null;
  const watched = Math.min(Math.max(0, positionSec - start), end - start);
  return Math.round((watched / (end - start)) * 100);
}

export type CourseDto = {
  id: number;
  slug: string;
  title: string;
  description: string;
  category: Exclude<Category, "all"> | string;
  level: CourseLevel;
  coverImage?: string;
  instructor?: string;
  durationMin: number;
  published: boolean;
  sortOrder: number;
  /** Minimum member level allowed to study this course. */
  minLevel: MemberLevel;
  /** True when the signed-in member's level is below minLevel. */
  locked: boolean;
  /** The signed-in member's own level (basic for admins / visitors). */
  memberLevel: MemberLevel;
  lessonCount: number;
  completedCount: number;
  /** 0-100, derived from completed lessons (never stored). */
  progressPct: number;
  enrolled: boolean;
};

export type CourseDetailDto = CourseDto & { lessons: CourseLessonDto[] };

export const YOUTUBE_CHANNEL_URL = "https://www.youtube.com/@besight/videos";
