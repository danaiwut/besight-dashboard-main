"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "./LanguageContext";
import Icon from "../Icon";
import type { CourseDetailDto, CourseLessonDto } from "../../lib/courses";
import { MEMBER_LEVEL_LABEL_KEYS } from "../../lib/memberLevel";

/** Read-only rendering of the customer course page (same markup/classes the
 *  dashboard uses) so an admin can preview exactly what learners will see —
 *  without leaving the CRM. No actions: buttons are shown disabled. */
export default function CoursePreview({ course }: { course: CourseDetailDto }) {
  const { t } = useLanguage();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const chapters = useMemo(() => {
    const map = new Map<string, CourseLessonDto[]>();
    for (const lesson of course.lessons) {
      const key = lesson.sectionTitle?.trim() || t("dash.courses.defaultSection");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(lesson);
    }
    return [...map.entries()].map(([title, lessons]) => ({ title, lessons }));
  }, [course.lessons, t]);

  return (
    <div>
      <div className="badge pending" style={{ marginBottom: 12, display: "inline-flex" }}>
        <Icon name="visibility" style={{ fontSize: 14 }} />
        {t("courseAdmin.previewBadge")}
      </div>

      <div className="fs-detail" style={{ gridTemplateColumns: "minmax(0,1fr) 280px" }}>
        <div>
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
                <span><Icon name="play_circle" /> {t("dash.courses.lessons", { n: course.lessonCount })}</span>
                <span><Icon name="schedule" /> {t("dash.courses.duration", { n: course.durationMin })}</span>
                <span><Icon name="signal_cellular_alt" /> {t(`dash.courses.level.${course.level}`)}</span>
                <span><Icon name="workspace_premium" /> {t(MEMBER_LEVEL_LABEL_KEYS[course.minLevel])}</span>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-primary" disabled>
                  <Icon name="school" />
                  {t("dash.courses.enroll")}
                </button>
              </div>
            </div>
          </div>

          <div className="card fs-section">
            <h3>{t("dash.courses.learnTitle")}</h3>
            <p className="comp-card-desc" style={{ whiteSpace: "pre-line" }}>{course.description || "—"}</p>
          </div>

          <div className="card fs-section">
            <h3>{t("dash.courses.curriculum")}</h3>
            <div className="fs-cur-meta">{t("dash.courses.curMeta", { n: course.lessonCount, min: course.durationMin })}</div>
            {chapters.length === 0 ? (
              <div className="table-empty">{t("courseAdmin.lessonsEmpty")}</div>
            ) : (
              chapters.map((chapter) => {
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
                            <div className="lms-lesson-row" key={lesson.id}>
                              <span className="lms-lesson-num">{index + 1}</span>
                              <span className="lms-lesson-body">
                                <span className="lms-lesson-title">{lesson.title}</span>
                                <span className="lms-lesson-meta">
                                  {t("dash.courses.duration", { n: lesson.durationMin })}
                                  {lesson.isPreview && <span className="badge pending" style={{ marginLeft: 8 }}>{t("dash.courses.preview")}</span>}
                                </span>
                              </span>
                              <Icon name="play_circle" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <aside className="fs-side">
          <div className="card fs-side-card">
            <div style={{ marginBottom: 14 }}>
              <div className="lms-lesson-kicker">{t("dash.courses.memberFree")}</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{t("dash.courses.memberFreeValue")}</div>
            </div>
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
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
