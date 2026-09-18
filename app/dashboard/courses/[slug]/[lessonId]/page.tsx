"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLanguage } from "../../../../../components/crm/LanguageContext";
import { useCrm } from "../../../../../components/crm/CrmContext";
import { apiCall } from "../../../../../lib/crmApi";
import Icon from "../../../../../components/Icon";
import LessonPlayer, { fmtTimecode } from "../../../../../components/courses/LessonPlayer";
import type { CourseDetailDto } from "../../../../../lib/courses";

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
    } catch {
      // progress is best-effort here — the manual button below surfaces errors
    }
    if (next) router.push(`/dashboard/courses/${course.slug}/${next.id}`);
  }

  async function toggleCompleted(next: boolean) {
    if (!course || !lesson) return;
    setBusy(true);
    try {
      await apiCall(`/api/courses/lessons/${lesson.id}/`, "PUT", { completed: next });
      setCourse({
        ...course,
        lessons: course.lessons.map((row) => (row.id === lesson.id ? { ...row, completed: next } : row)),
        completedCount: course.completedCount + (next ? (lesson.completed ? 0 : 1) : lesson.completed ? -1 : 0),
        progressPct: course.lessonCount
          ? Math.round(((course.completedCount + (next ? (lesson.completed ? 0 : 1) : lesson.completed ? -1 : 0)) / course.lessonCount) * 100)
          : 0,
        enrolled: true,
      });
      toast(t(next ? "dash.courses.markedDone" : "dash.courses.markedUndone"));
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

  const index = course.lessons.findIndex((row) => row.id === lessonId);
  const lesson = index >= 0 ? course.lessons[index] : null;
  const previous = index > 0 ? course.lessons[index - 1] : null;
  const next = index >= 0 && index < course.lessons.length - 1 ? course.lessons[index + 1] : null;

  return (
    <div className="lms-player">
      <div className="lms-player-main">
        <Link href={`/dashboard/courses/${course.slug}`} className="course-detail-back">
          <Icon name="arrow_back" />
          {course.title}
        </Link>

        <div className="card lms-video-card">
          {lesson ? (
            <LessonPlayer key={`${lesson.id}:${lesson.startSec}:${lesson.endSec ?? ""}`} lesson={lesson} onEnded={() => void complete(lesson, next)} />
          ) : (
            <div className="lms-video lms-video-empty">
              <Icon name="smart_display" />
              <span>{t("dash.courses.noVideo")}</span>
            </div>
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
              disabled={busy || !lesson}
              onClick={() => void toggleCompleted(!lesson?.completed)}
            >
              <Icon name={lesson?.completed ? "undo" : "check_circle"} />
              {lesson?.completed ? t("dash.courses.markUndone") : t("dash.courses.markDone")}
            </button>
          </div>

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
