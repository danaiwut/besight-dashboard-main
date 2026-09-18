"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLanguage } from "../../../../../components/crm/LanguageContext";
import { useCrm } from "../../../../../components/crm/CrmContext";
import { apiCall } from "../../../../../lib/crmApi";
import Icon from "../../../../../components/Icon";
import type { CourseDetailDto, CourseLessonDto } from "../../../../../lib/courses";

/** Learning overview for one course (FutureSkill "learning/course" equivalent):
 *  progress, resume button and the full curriculum grouped into sections. */
export default function CourseLearnPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const { t } = useLanguage();
  const { toast } = useCrm();
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

  const chapters = useMemo(() => {
    if (!course) return [] as { title: string; lessons: CourseLessonDto[] }[];
    const map = new Map<string, CourseLessonDto[]>();
    for (const lesson of course.lessons) {
      const key = lesson.sectionTitle?.trim() || t("dash.courses.defaultSection");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(lesson);
    }
    return [...map.entries()].map(([title, lessons]) => ({ title, lessons }));
  }, [course, t]);

  async function enroll() {
    setBusy(true);
    try {
      const payload = await apiCall<{ course: CourseDetailDto }>(`/api/courses/${slug}/enroll/`, "POST");
      setCourse(payload.course);
      toast(t("dash.courses.enrolledToast"));
    } catch (enrollError) {
      toast(enrollError instanceof Error ? enrollError.message : "ลงทะเบียนเรียนไม่สำเร็จ");
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

  const next = course.lessons.find((lesson) => !lesson.completed) ?? course.lessons[0];

  return (
    <div>
      <Link href={`/dashboard/courses/${course.slug}`} className="course-detail-back">
        <Icon name="arrow_back" />
        {course.title}
      </Link>

      <div className="card fs-learn-head">
        {course.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin-provided cover image
          <img className="fs-learn-cover" src={course.coverImage} alt="" />
        ) : (
          <span className="fs-learn-cover" />
        )}
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 className="fs-hero-title" style={{ fontSize: 20 }}>{course.title}</h1>
          <div className="course-progress-top" style={{ marginTop: 10 }}>
            <span className="course-progress-name">
              {t("dash.courses.progressLabel", { done: course.completedCount, total: course.lessonCount })}
            </span>
            <span className="course-progress-pct">{course.progressPct}%</span>
          </div>
          <div className="reward-card-track">
            <span className="reward-card-fill" style={{ width: `${course.progressPct}%` }} />
          </div>
        </div>
        {course.enrolled ? (
          next && (
            <Link className="btn btn-primary" href={`/dashboard/courses/${course.slug}/${next.id}`}>
              <Icon name="play_circle" />
              {course.progressPct === 100 ? t("dash.courses.review") : t("dash.courses.continue")}
            </Link>
          )
        ) : (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void enroll()}>
            <Icon name="school" />
            {busy ? "…" : t("dash.courses.enroll")}
          </button>
        )}
      </div>

      <div className="card fs-section">
        <h3>{t("dash.courses.curriculum")}</h3>
        <div className="fs-cur-meta">{t("dash.courses.curMeta", { n: course.lessonCount, min: course.durationMin })}</div>
        {chapters.map((chapter) => {
          const completed = chapter.lessons.filter((lesson) => lesson.completed).length;
          const minutes = chapter.lessons.reduce((sum, lesson) => sum + lesson.durationMin, 0);
          return (
            <div className="fs-chapter" key={chapter.title}>
              <div className="fs-chapter-head" style={{ cursor: "default" }}>
                <span>
                  <span className="fs-chapter-title">{chapter.title}</span>
                  <span className="fs-chapter-meta" style={{ display: "block", marginTop: 2 }}>
                    {t("dash.courses.chapterMeta", { n: chapter.lessons.length, min: minutes })} · {completed}/{chapter.lessons.length}
                  </span>
                </span>
                <span className={`badge ${completed === chapter.lessons.length ? "active" : "pending"}`}>
                  {completed === chapter.lessons.length ? t("dash.courses.done") : `${Math.round((completed / chapter.lessons.length) * 100)}%`}
                </span>
              </div>
              <div className="fs-chapter-body">
                <div className="lms-lesson-list">
                  {chapter.lessons.map((lesson, index) => (
                    <Link className="lms-lesson-row" key={lesson.id} href={`/dashboard/courses/${course.slug}/${lesson.id}`}>
                      <span className={`lms-lesson-num${lesson.completed ? " is-done" : ""}`}>
                        {lesson.completed ? <Icon name="check" /> : index + 1}
                      </span>
                      <span className="lms-lesson-body">
                        <span className="lms-lesson-title">{lesson.title}</span>
                        <span className="lms-lesson-meta">{t("dash.courses.duration", { n: lesson.durationMin })}</span>
                      </span>
                      <Icon name={lesson.completed ? "replay" : "play_circle"} />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
