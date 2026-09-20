"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLanguage } from "../../../../../components/crm/LanguageContext";
import { useCrm } from "../../../../../components/crm/CrmContext";
import { apiCall } from "../../../../../lib/crmApi";
import Icon from "../../../../../components/Icon";
import LessonPlayer, { fmtTimecode, type WatchProgress } from "../../../../../components/courses/LessonPlayer";
import type { CourseDetailDto } from "../../../../../lib/courses";
import { WATCH_COMPLETE_PCT, watchedPctOf } from "../../../../../lib/courses";

export default function CourseLessonPage() {
  const params = useParams<{ slug: string; lessonId: string }>();
  const router = useRouter();
  const { t } = useLanguage();
  const { toast } = useCrm();
  const slug = params?.slug ?? "";
  const lessonId = Number(params?.lessonId);

  const [course, setCourse] = useState<CourseDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Live watched % for the open lesson (seeded from the server snapshot).
  const [watched, setWatched] = useState<Record<number, number>>({});

  const index = course?.lessons.findIndex((row) => row.id === lessonId) ?? -1;
  const lesson = course && index >= 0 ? course.lessons[index] : null;
  const watchedPct = lesson ? (watched[lesson.id] ?? lesson.watchedPct ?? 0) : 0;
  // Reading-only lessons (no video) are always tickable; video lessons need
  // ≥90% watched — enforced server-side, mirrored here for the button state.
  const tickable = !lesson || lesson.completed || !lesson.videoId || watchedPct >= WATCH_COMPLETE_PCT;

  async function sendHeartbeat(progress: WatchProgress) {
    if (!lesson || lesson.completed) return;
    try {
      const payload = await apiCall<{ watchedPct: number | null }>(`/api/courses/lessons/${lesson.id}/progress/`, "PUT", {
        positionSec: progress.positionSec,
        durationSec: progress.durationSec,
      });
      const pct = payload.watchedPct ?? watchedPctOf(progress.positionSec, progress.durationSec, lesson.startSec, lesson.endSec) ?? 0;
      setWatched((cur) => (cur[lesson.id] === pct ? cur : { ...cur, [lesson.id]: pct }));
    } catch {
      // Heartbeats are best-effort — the tick surfaces real errors.
    }
  }

  const load = useCallback(async () => {
    try {
      const payload = await apiCall<{ course: CourseDetailDto }>(`/api/courses/${slug}/`, "GET");
      setCourse(payload.course);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Course not found");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load; the async fetch sets state in its callback
    void load();
  }, [load]);

  async function complete(lesson: CourseDetailDto["lessons"][number], next: CourseDetailDto["lessons"][number] | null) {
    if (!course) return;
    try {
      await apiCall(`/api/courses/lessons/${lesson.id}/`, "PUT", { completed: true });
      setCourse({
        ...course,
        lessons: course.lessons.map((row) => (row.id === lesson.id ? { ...row, completed: true } : row)),
        completedCount: course.completedCount + (lesson.completed ? 0 : 1),
        progressPct: course.lessonCount ? Math.round(((course.completedCount + (lesson.completed ? 0 : 1)) / course.lessonCount) * 100) : 0,
        enrolled: true,
      });
    } catch (completeError) {
      // Usually the ≥90% watch gate — the manual button shows the message.
      toast(completeError instanceof Error ? completeError.message : t("dash.courses.watchMore"));
      return;
    }
    if (next) router.push(`/dashboard/courses/${course.slug}/${next.id}`);
  }

  async function toggleCompleted(nextDone: boolean) {
    if (!course || !lesson) return;
    setBusy(true);
    try {
      const payload = await apiCall<{ watchedPct?: number | null }>(`/api/courses/lessons/${lesson.id}/`, "PUT", { completed: nextDone });
      if (typeof payload.watchedPct === "number") {
        const pct = payload.watchedPct;
        setWatched((cur) => ({ ...cur, [lesson.id]: pct }));
      }
      setCourse({
        ...course,
        lessons: course.lessons.map((row) => (row.id === lesson.id ? { ...row, completed: nextDone } : row)),
        completedCount: course.completedCount + (nextDone ? (lesson.completed ? 0 : 1) : lesson.completed ? -1 : 0),
        progressPct: course.lessonCount
          ? Math.round(((course.completedCount + (nextDone ? (lesson.completed ? 0 : 1) : lesson.completed ? -1 : 0)) / course.lessonCount) * 100)
          : 0,
        enrolled: true,
      });
      toast(t(nextDone ? "dash.courses.markedDone" : "dash.courses.markedUndone"));
    } catch (updateError) {
      toast(updateError instanceof Error ? updateError.message : "อัปเดตความคืบหน้าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <p className="modal-detail" style={{ textAlign: "left", margin: 0 }}>…</p>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <p>{error || t("dash.courses.empty")}</p>
        <Link href="/dashboard/courses" className="btn btn-ghost" style={{ marginTop: 12 }}>
          <Icon name="arrow_back" />
          {t("dash.course.back")}
        </Link>
      </div>
    );
  }

  const previous = index > 0 && course ? course.lessons[index - 1] : null;
  const next = course && index >= 0 && index < course.lessons.length - 1 ? course.lessons[index + 1] : null;
  // Stripped by the server preview lock (no video while locked/unenrolled).
  const lessonLocked = course.locked || !course.enrolled;

  return (
    <div className="lms-player">
      <div className="lms-player-main">
        <Link href={`/dashboard/courses/${course.slug}`} className="course-detail-back">
          <Icon name="arrow_back" />
          {course.title}
        </Link>

        <div className="card lms-video-card">
          {!lesson || (!lesson.videoId && lessonLocked) ? (
            <div className="lms-video lms-video-empty">
              <Icon name={lessonLocked ? "lock" : "smart_display"} />
              <span>
                {!lessonLocked
                  ? t("dash.courses.noVideo")
                  : course.locked
                    ? t("dash.courses.levelRequired", { level: t(`dash.level.${course.minLevel}`) })
                    : t("dash.courses.enrollFirst")}
              </span>
            </div>
          ) : (
            <LessonPlayer
              key={`${lesson.id}:${lesson.startSec}:${lesson.endSec ?? ""}`}
              lesson={lesson}
              onEnded={() => void complete(lesson, next)}
              onProgress={(progress) => void sendHeartbeat(progress)}
            />
          )}
        </div>

        <div className="card" style={{ padding: 22, marginTop: 16 }}>
          <div className="lms-lesson-head">
            <div>
              <div className="lms-lesson-kicker">
                {t("dash.courses.lesson", { n: index + 1 })} / {course.lessonCount}
                {lesson?.videoId && (
                  <span style={{ marginLeft: 8, fontWeight: 400 }}>
                    · {t("courseAdmin.field.chapter")} {fmtTimecode(lesson.startSec)}
                    {lesson.endSec != null ? ` – ${fmtTimecode(lesson.endSec)}` : ` – ${t("dash.courses.toEnd")}`}
                  </span>
                )}
              </div>
              <h1 className="activity-detail-title" style={{ marginTop: 2 }}>{lesson?.title ?? "—"}</h1>
            </div>
            <button
              type="button"
              className={`btn ${lesson?.completed ? "btn-ghost" : "btn-primary"}`}
              disabled={busy || !lesson || (!lesson.completed && !tickable)}
              title={!lesson?.completed && !tickable ? t("dash.courses.watchMore", { pct: WATCH_COMPLETE_PCT, watched: watchedPct }) : undefined}
              onClick={() => void toggleCompleted(!lesson?.completed)}
            >
              <Icon name={lesson?.completed ? "undo" : tickable ? "check_circle" : "lock"} />
              {lesson?.completed
                ? t("dash.courses.markUndone")
                : lesson?.videoId
                  ? t("dash.courses.markDonePct", { watched: watchedPct })
                  : t("dash.courses.markDone")}
            </button>
          </div>

          {lesson?.videoId && !lesson.completed && (
            <div style={{ marginTop: 10 }}>
              <div className="course-progress-top">
                <span className="course-progress-name">{t("dash.courses.watchedLabel")}</span>
                <span className="course-progress-pct">{watchedPct}%</span>
              </div>
              <div className="reward-card-track">
                <span className="reward-card-fill" style={{ width: `${Math.min(100, watchedPct)}%` }} />
              </div>
            </div>
          )}

          {lesson?.script && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
              <div className="panel-section-title" style={{ marginBottom: 6 }}>{t("dash.courses.script")}</div>
              <p className="comp-card-desc" style={{ whiteSpace: "pre-line" }}>{lesson.script}</p>
            </div>
          )}

          <div className="lms-player-nav">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!previous}
              onClick={() => previous && router.push(`/dashboard/courses/${course.slug}/${previous.id}`)}
            >
              <Icon name="chevron_left" />
              {t("dash.courses.prevLesson")}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!next}
              onClick={() => next && router.push(`/dashboard/courses/${course.slug}/${next.id}`)}
            >
              {t("dash.courses.nextLesson")}
              <Icon name="chevron_right" />
            </button>
          </div>
        </div>
      </div>

      <div className="card lms-player-side">
        <div className="panel-section-title">{t("dash.courses.curriculum")}</div>
        <div className="course-progress-top" style={{ marginTop: 8 }}>
          <span className="course-progress-name">{t("dash.courses.progressLabel", { done: course.completedCount, total: course.lessonCount })}</span>
          <span className="course-progress-pct">{course.progressPct}%</span>
        </div>
        <div className="reward-card-track" style={{ marginBottom: 12 }}>
          <span className="reward-card-fill" style={{ width: `${course.progressPct}%` }} />
        </div>
        <div className="lms-lesson-list">
          {course.lessons.map((row, i) => (
            <Link
              className={`lms-lesson-row${row.id === lesson?.id ? " is-current" : ""}`}
              key={row.id}
              href={`/dashboard/courses/${course.slug}/${row.id}`}
            >
              <span className={`lms-lesson-num${row.completed ? " is-done" : ""}`}>{row.completed ? <Icon name="check" /> : i + 1}</span>
              <span className="lms-lesson-body">
                <span className="lms-lesson-title">{row.title}</span>
                <span className="lms-lesson-meta">
                  {t("dash.courses.duration", { n: row.durationMin })}
                  {row.videoId && row.startSec > 0 && <> · {fmtTimecode(row.startSec)}</>}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
