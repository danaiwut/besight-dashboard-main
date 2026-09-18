"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "../crm/LanguageContext";
import { useCrm } from "../crm/CrmContext";
import { apiCall } from "../../lib/crmApi";
import Icon from "../Icon";
import type { CourseDetailDto, CourseLessonDto } from "../../lib/courses";
import { MEMBER_LEVEL_LABEL_KEYS } from "../../lib/memberLevel";

function firstIncomplete(course: CourseDetailDto) {
  return course.lessons.find((lesson) => !lesson.completed) ?? course.lessons[0];
}

export default function CourseDetailView({ slug }: { slug: string }) {
  const { t } = useLanguage();
  const { toast } = useCrm();
  const [course, setCourse] = useState<CourseDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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

  const next = firstIncomplete(course);
  const done = course.progressPct === 100;

  return (
    <div>
      <Link href="/dashboard/courses" className="course-detail-back">
        <Icon name="arrow_back" />
        {t("dash.course.back")}
      </Link>

      <div className="fs-detail">
        <div>
          {/* Hero — cover, title, instructor, meta */}
          <div className="card fs-hero">
            <div className="fs-hero-cover">
              {course.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin-provided cover image
                <img src={course.coverImage} alt="" />
              ) : (
                <Icon name="school" />
              )}
            </div>
            <div className="fs-hero-body">
              <h1 className="fs-hero-title">{course.title}</h1>
              <div className="fs-instructor">
                <span className="fs-instructor-avatar">
                  {/* eslint-disable-next-line @next/next/no-img-element -- static export, small local demo avatar */}
                  <img src="/img/avatars/avatar-3.png" alt={course.instructor ?? ""} />
                </span>
                <span>
                  <div className="fs-instructor-name">{course.instructor || "BeSight Academy"}</div>
                  <div className="fs-instructor-role">{t("dash.courses.mentor1.role")}</div>
                </span>
              </div>
              <div className="fs-hero-meta">
                <span>
                  <Icon name="play_circle" /> {t("dash.courses.lessons", { n: course.lessonCount })}
                </span>
                <span>
                  <Icon name="schedule" /> {t("dash.courses.duration", { n: course.durationMin })}
                </span>
                <span>
                  <Icon name="signal_cellular_alt" /> {t(`dash.courses.level.${course.level}`)}
                </span>
              </div>
            </div>
          </div>

          {/* What you'll learn */}
          <div className="card fs-section">
            <h3>{t("dash.courses.learnTitle")}</h3>
            <p className="comp-card-desc" style={{ whiteSpace: "pre-line" }}>{course.description}</p>
          </div>

          {/* Curriculum */}
          <div className="card fs-section">
            <h3>{t("dash.courses.curriculum")}</h3>
            <div className="fs-cur-meta">
              {t("dash.courses.curMeta", { n: course.lessonCount, min: course.durationMin })}
            </div>
            {chapters.map((chapter) => {
              const isOpen = !collapsed.has(chapter.title);
              const minutes = chapter.lessons.reduce((sum, lesson) => sum + lesson.durationMin, 0);
              return (
                <div className="fs-chapter" key={chapter.title}>
                  <button
                    type="button"
                    className="fs-chapter-head"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setCollapsed((cur) => {
                        const copy = new Set(cur);
                        if (copy.has(chapter.title)) copy.delete(chapter.title);
                        else copy.add(chapter.title);
                        return copy;
                      })
                    }
                  >
                    <span>
                      <span className="fs-chapter-title">{chapter.title}</span>
                      <span className="fs-chapter-meta" style={{ display: "block", marginTop: 2 }}>
                        {t("dash.courses.chapterMeta", { n: chapter.lessons.length, min: minutes })}
                      </span>
                    </span>
                    <Icon name={isOpen ? "expand_less" : "expand_more"} />
                  </button>
                  {isOpen && (
                    <div className="fs-chapter-body">
                      <div className="lms-lesson-list">
                        {chapter.lessons.map((lesson, index) => (
                          <Link className="lms-lesson-row" key={lesson.id} href={`/dashboard/courses/${course.slug}/${lesson.id}`}>
                            <span className={`lms-lesson-num${lesson.completed ? " is-done" : ""}`}>
                              {lesson.completed ? <Icon name="check" /> : index + 1}
                            </span>
                            <span className="lms-lesson-body">
                              <span className="lms-lesson-title">{lesson.title}</span>
                              <span className="lms-lesson-meta">
                                {t("dash.courses.duration", { n: lesson.durationMin })}
                                {lesson.isPreview && <span className="badge pending" style={{ marginLeft: 8 }}>{t("dash.courses.preview")}</span>}
                                {lesson.completed && <span className="badge active" style={{ marginLeft: 8 }}>{t("dash.courses.done")}</span>}
                              </span>
                            </span>
                            <Icon name="play_circle" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Side card — CTA + course facts */}
        <aside className="fs-side">
          <div className="card fs-side-card">
            <div style={{ marginBottom: 14 }}>
              <div className="lms-lesson-kicker">{t("dash.courses.memberFree")}</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{t("dash.courses.memberFreeValue")}</div>
            </div>
            {course.locked ? (
              <div className="badge expired" style={{ display: "flex", justifyContent: "center", padding: "10px 12px" }}>
                <Icon name="lock" style={{ fontSize: 15 }} />
                {t("dash.courses.levelRequired", { level: t(MEMBER_LEVEL_LABEL_KEYS[course.minLevel]) })}
              </div>
            ) : course.enrolled || done ? (
              next && (
                <Link className="btn btn-primary fs-side-cta" href={`/dashboard/courses/${course.slug}/${next.id}`}>
                  <Icon name="play_circle" />
                  {done ? t("dash.courses.review") : t("dash.courses.continue")}
                </Link>
              )
            ) : (
              <button type="button" className="btn btn-primary fs-side-cta" disabled={busy} onClick={() => void enroll()}>
                <Icon name="school" />
                {busy ? "…" : t("dash.courses.enroll")}
              </button>
            )}
            <div className="fs-side-rows">
              <div className="fs-side-total">
                <span className="k">{t("dash.courses.summary.lessons")}</span>
                <span className="v">{course.lessonCount}</span>
              </div>
              <div className="fs-side-total">
                <span className="k">{t("dash.courses.colDuration")}</span>
                <span className="v">{t("dash.courses.duration", { n: course.durationMin })}</span>
              </div>
              <div className="fs-side-total">
                <span className="k">{t("courseAdmin.col.level")}</span>
                <span className="v">{t(`dash.courses.level.${course.level}`)}</span>
              </div>
              <div className="fs-side-total">
                <span className="k">{t("courseAdmin.col.minLevel")}</span>
                <span className="v">{t(MEMBER_LEVEL_LABEL_KEYS[course.minLevel])}</span>
              </div>
              {course.enrolled && (
                <div className="fs-side-total">
                  <span className="k">{t("dash.courses.progress.title")}</span>
                  <span className="v">{course.progressPct}%</span>
                </div>
              )}
            </div>
            {course.lessons[0] && (
              <Link className="btn btn-ghost fs-side-cta" style={{ marginTop: 12 }} href={`/dashboard/courses/${course.slug}/${course.lessons[0].id}`}>
                <Icon name="play_circle" />
                {t("dash.courses.preview")}
              </Link>
            )}
            {course.enrolled && (
              <Link className="btn btn-ghost fs-side-cta" style={{ marginTop: 8 }} href={`/dashboard/courses/${course.slug}/learn`}>
                <Icon name="menu_book" />
                {t("dash.courses.myLearning")}
              </Link>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
