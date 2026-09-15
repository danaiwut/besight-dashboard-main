export type Category = "all" | "beginner" | "technical" | "risk" | "psychology" | "strategy";

export const TABS: Category[] = ["all", "beginner", "technical", "risk", "psychology", "strategy"];

export type Course = {
  key: string;
  category: Exclude<Category, "all">;
  icon: string;
  color: "c1" | "c2" | "c3" | "c4" | "c5";
  rating: number;
  lessons: number;
  tags: string[];
  /** Real BeSight YouTube upload, embedded on the course's own lesson page. */
  videoId: string;
};

export const COURSES: Course[] = [
  { key: "c1", category: "beginner", icon: "candlestick_chart", color: "c1", rating: 4.9, lessons: 12, tags: ["Price Action", "Beginner"], videoId: "-rYTiuWdB60" },
  { key: "c2", category: "technical", icon: "insights", color: "c2", rating: 5.0, lessons: 8, tags: ["Orca", "Indicators"], videoId: "34oT92NBYgA" },
  { key: "c3", category: "risk", icon: "security", color: "c3", rating: 4.8, lessons: 10, tags: ["Risk", "Money Mgmt"], videoId: "FaruOIJKxWM" },
  { key: "c4", category: "psychology", icon: "psychology", color: "c4", rating: 4.7, lessons: 9, tags: ["Mindset", "Journaling"], videoId: "GL6hkjdQsq8" },
  { key: "c5", category: "technical", icon: "timeline", color: "c5", rating: 4.9, lessons: 14, tags: ["Chart Patterns"], videoId: "LDsaKL5taWY" },
  { key: "c6", category: "strategy", icon: "bolt", color: "c1", rating: 4.6, lessons: 7, tags: ["Scalping", "XM"], videoId: "OuVZhogCP58" },
];

export function courseByKey(key: string): Course | undefined {
  return COURSES.find((c) => c.key === key);
}

export const MENTORS = [
  { name: "Nora Chen", roleKey: "dash.courses.mentor1.role", exp: 8, avatar: 3 },
  { name: "Diego Alvarez", roleKey: "dash.courses.mentor2.role", exp: 6, avatar: 7 },
  { name: "Marcus Webb", roleKey: "dash.courses.mentor3.role", exp: 10, avatar: 5 },
];

export const IN_PROGRESS = [
  { courseKey: "c2", unit: 3, pct: 80 },
  { courseKey: "c3", unit: 1, pct: 60 },
  { courseKey: "c1", unit: 2, pct: 40 },
];

export const YOUTUBE_CHANNEL_URL = "https://www.youtube.com/@besight/videos";

/** Generic 7-stage breakdown reused for every course's chapter list — the
 *  demo has no real per-lesson curriculum data, so every course gets the
 *  same shape (a couple of chapters done, one active, the rest locked)
 *  rather than fabricating a distinct outline per course. */
export const CHAPTER_TEMPLATE_KEYS = [
  "dash.course.chapter.intro",
  "dash.course.chapter.core",
  "dash.course.chapter.example1",
  "dash.course.chapter.example2",
  "dash.course.chapter.mistakes",
  "dash.course.chapter.advanced",
  "dash.course.chapter.review",
];

export const ACTIVE_CHAPTER_INDEX = 3;
