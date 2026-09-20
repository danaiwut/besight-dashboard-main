/** Course Online (LMS): shared client-safe types + the seed curriculum. The
 *  database is the runtime source of truth (admin-edited in the CRM); this
 *  module only defines the shapes and what a freshly seeded install contains.
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

export const MENTORS = [
  { name: "Nora Chen", roleKey: "dash.courses.mentor1.role", exp: 8, avatar: 3 },
  { name: "Diego Alvarez", roleKey: "dash.courses.mentor2.role", exp: 6, avatar: 7 },
  { name: "Marcus Webb", roleKey: "dash.courses.mentor3.role", exp: 10, avatar: 5 },
];

/** Chapter titles used to build each seeded curriculum (Thai, matching the
 *  admin-authored content language of the rest of the CMS). */
const CHAPTER_TITLES = [
  "แนะนำภาพรวมของคอร์ส",
  "แนวคิดหลักที่ต้องเข้าใจ",
  "ตัวอย่างกราฟจริง ตอนที่ 1",
  "ตัวอย่างกราฟจริง ตอนที่ 2",
  "ข้อผิดพลาดที่พบบ่อย",
  "เทคนิคขั้นสูงเพิ่มเติม",
  "สรุปและแบบฝึกหัดท้ายบท",
];

type CourseSeed = {
  slug: string;
  category: Exclude<Category, "all">;
  level: CourseLevel;
  title: string;
  description: string;
  instructor: string;
  videoId: string;
  /** How many of the chapter titles this course uses. */
  lessonCount: number;
};

export const COURSE_SEED: CourseSeed[] = [
  {
    slug: "price-action-fundamentals",
    category: "beginner",
    level: "beginner",
    title: "พื้นฐาน Price Action",
    description: "อ่านแท่งเทียน โครงสร้างตลาด และแนวรับแนวต้านได้อย่างมืออาชีพ โดยไม่ต้องพึ่งอินดิเคเตอร์",
    instructor: "Nora Chen",
    videoId: "-rYTiuWdB60",
    lessonCount: 7,
  },
  {
    slug: "orca-indicator-mastery",
    category: "technical",
    level: "intermediate",
    title: "เชี่ยวชาญอินดิเคเตอร์ BeSight Orca",
    description: "ใช้งานอินดิเคเตอร์ Orca ให้เต็มประสิทธิภาพ ทั้งการกรองสัญญาณ จุดบรรจบ และจังหวะเข้าออเดอร์",
    instructor: "Marcus Webb",
    videoId: "34oT92NBYgA",
    lessonCount: 7,
  },
  {
    slug: "risk-money-management",
    category: "risk",
    level: "beginner",
    title: "แผนบริหารความเสี่ยงและเงินทุน",
    description: "การคำนวณขนาดล็อต ควบคุม Drawdown และหลักการอยู่รอดในตลาดระยะยาว",
    instructor: "Diego Alvarez",
    videoId: "FaruOIJKxWM",
    lessonCount: 6,
  },
  {
    slug: "trading-psychology",
    category: "psychology",
    level: "intermediate",
    title: "จิตวิทยาและวินัยการเทรด",
    description: "เอาชนะการเทรดแก้แค้น ความกลัวตกรถ และความมั่นใจเกินเหตุ ด้วยระบบบันทึกการเทรดจริง",
    instructor: "Nora Chen",
    videoId: "GL6hkjdQsq8",
    lessonCount: 6,
  },
  {
    slug: "advanced-chart-patterns",
    category: "technical",
    level: "advanced",
    title: "รูปแบบกราฟขั้นสูง",
    description: "จับสัญญาณ Flag, Wedge และ Double Top ได้ตั้งแต่เนิ่นๆ พร้อมตัวอย่างกราฟจริง",
    instructor: "Marcus Webb",
    videoId: "LDsaKL5taWY",
    lessonCount: 7,
  },
  {
    slug: "scalping-fast-markets",
    category: "strategy",
    level: "advanced",
    title: "กลยุทธ์ Scalping สำหรับตลาดเร็ว",
    description: "จังหวะเข้าออเดอร์แบบสั้นสำหรับคู่เงินที่เคลื่อนไหวเร็วของ XM เหมาะกับช่วงเวลาสั้นๆ ระหว่างเทรด",
    instructor: "Diego Alvarez",
    videoId: "OuVZhogCP58",
    lessonCount: 6,
  },
];

/** Builds the lesson rows for one seeded course — every lesson reuses the
 *  course's real YouTube upload until the team splits it into chapters. */
const CHAPTER_SECTIONS = ["ปูพื้นฐาน", "ปูพื้นฐาน", "ปฏิบัติจริง", "ปฏิบัติจริง", "ปฏิบัติจริง", "สรุปและแบบฝึกหัด", "สรุปและแบบฝึกหัด"];

export function seedLessonsFor(course: CourseSeed, index: number) {
  return CHAPTER_TITLES.slice(0, course.lessonCount).map((title, i) => ({
    title,
    sectionTitle: CHAPTER_SECTIONS[i] ?? "บทเรียน",
    videoId: course.videoId,
    durationMin: 8 + ((i * 3 + index) % 12),
    sortOrder: i,
    isPreview: i === 0,
  }));
}
