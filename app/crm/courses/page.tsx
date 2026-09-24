"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCrm } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { TableSkeleton } from "../../../components/crm/Skeletons";
import { apiCall } from "../../../lib/crmApi";
import { type CourseDto } from "../../../lib/courses";
import { MEMBER_LEVEL_LABEL_KEYS, type MemberLevel } from "../../../lib/memberLevel";
import Icon from "../../../components/Icon";

const LEVEL_BADGE: Record<MemberLevel, string> = { basic: "suspended", standard: "pending", premium: "active" };

export default function CrmCoursesPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { toast, log, dataVersion, crmDataStatus } = useCrm();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [courses, setCourses] = useState<CourseDto[]>([]);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await apiCall<{ courses: CourseDto[] }>("/api/crm/courses/", "GET");
      setCourses(payload.courses);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load courses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (crmDataStatus === "loading") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload on realtime version changes
    void load();
  }, [crmDataStatus, dataVersion, load]);

  const stats = useMemo(() => {
    const minutes = courses.reduce((sum, course) => sum + course.durationMin, 0);
    return {
      total: courses.length,
      published: courses.filter((course) => course.published).length,
      lessons: courses.reduce((sum, course) => sum + course.lessonCount, 0),
      hours: Math.round((minutes / 60) * 10) / 10,
    };
  }, [courses]);

  /* ── Courses ── */

  /** New courses enter the same full-page editor as existing courses. */
  async function createCourse() {
    setCreating(true);
    try {
      const payload = await apiCall<{ course: CourseDto }>("/api/crm/courses/", "POST", {
        title: t("courseAdmin.newCourse"), category: "beginner", level: "beginner", minLevel: "basic",
        sortOrder: courses.length, published: false,
      });
      log({ actor: "Admin", action: "Course Added", description: `Course "${payload.course.title}" created as draft.` });
      router.push(`/crm/courses/${payload.course.id}/watch`);
    } catch (createError) {
      toast(createError instanceof Error ? createError.message : "Unable to create course");
    } finally {
      setCreating(false);
    }
  }

  /** Quick publish switch straight from a card/row — no drawer needed. */
  async function togglePublished(course: CourseDto) {
    setTogglingId(course.id);
    try {
      const payload = await apiCall<{ course: CourseDto }>(`/api/crm/courses/${course.id}/`, "PUT", { published: !course.published });
      setCourses((cur) => cur.map((c) => (c.id === payload.course.id ? payload.course : c)));
      toast(t(payload.course.published ? "act.published.yes" : "courseAdmin.draft"));
    } catch (toggleError) {
      toast(toggleError instanceof Error ? toggleError.message : "Unable to update course");
    } finally {
      setTogglingId(null);
    }
  }

  async function removeCourse(course: CourseDto) {
    if (!window.confirm(t("courseAdmin.removeConfirm", { title: course.title }))) return;
    try {
      await apiCall(`/api/crm/courses/${course.id}/`, "DELETE");
      setCourses((cur) => cur.filter((c) => c.id !== course.id));
      toast(t("courseAdmin.removed"));
    } catch (removeError) {
      toast(removeError instanceof Error ? removeError.message : "Unable to delete course");
    }
  }

  if (crmDataStatus === "loading" || loading) {
    return (
      <section className="panel is-active">
        <TableSkeleton cols={6} rows={5} minWidth={900} />
      </section>
    );
  }

  return (
    <section className="panel is-active crm-operations-page course-catalog-page">
      <div className="crm-page-command">
        <div>
          <span className="crm-page-eyebrow"><Icon name="school" /> {t("title.courses")}</span>
          <p>{t("crm.page.coursesDesc")}</p>
        </div>
        <button className="btn btn-primary" onClick={() => void createCourse()} disabled={creating}>
          <Icon name="add" />
          {creating ? "…" : t("courseAdmin.add")}
        </button>
      </div>
      {/* Summary */}
      <div className="stat-grid cols-4 course-catalog-stats" style={{ marginBottom: 18 }}>
        <div className="stat-card">
          <div className="value">{stats.total}</div>
          <div className="label">{t("courseAdmin.totalCourses")}</div>
        </div>
        <div className="stat-card">
          <div className="value">{stats.published}</div>
          <div className="label">{t("courseAdmin.publishedCount")}</div>
        </div>
        <div className="stat-card">
          <div className="value">{stats.lessons}</div>
          <div className="label">{t("courseAdmin.totalLessons")}</div>
        </div>
        <div className="stat-card">
          <div className="value">{stats.hours}</div>
          <div className="label">{t("courseAdmin.totalHours")}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button type="button" className={`tab${view === "cards" ? " is-active" : ""}`} onClick={() => setView("cards")}>
            <Icon name="grid_view" style={{ fontSize: 15 }} /> {t("courseAdmin.view.cards")}
          </button>
          <button type="button" className={`tab${view === "table" ? " is-active" : ""}`} onClick={() => setView("table")}>
            <Icon name="list" style={{ fontSize: 15 }} /> {t("courseAdmin.view.table")}
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16, color: "var(--red)" }}>
          {error}
        </div>
      )}

      {/* Card grid */}
      {view === "cards" &&
        (courses.length ? (
          <div className="admin-course-grid">
            {courses.map((course) => {
              const categoryLabel = t(`dash.courses.tab.${course.category}`);
              const levelLabel = t(`dash.courses.level.${course.level}`);
              return (
              <div className="card admin-course-card" key={course.id}>
                <div className="admin-course-cover">
                  {course.coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- admin-provided cover image
                    <img src={course.coverImage} alt="" />
                  ) : (
                    <Icon name="school" />
                  )}
                  <div className="admin-course-cover-badges">
                    <span className={`badge ${course.published ? "active" : "suspended"}`}>
                      {course.published ? t("act.published.yes") : t("courseAdmin.draft")}
                    </span>
                    <span className={`badge ${LEVEL_BADGE[course.minLevel]}`}>{t(MEMBER_LEVEL_LABEL_KEYS[course.minLevel])}</span>
                  </div>
                </div>
                <div className="admin-course-body">
                  <div>
                    <div className="admin-course-title">{course.title}</div>
                    <div className="admin-course-desc">{course.description || "—"}</div>
                  </div>
                  <div className="admin-course-meta">
                    <span className="course-tag">{categoryLabel}</span>
                    {levelLabel !== categoryLabel && <span className="course-tag">{levelLabel}</span>}
                    <span className="admin-course-meta-text">
                      {t("dash.courses.lessons", { n: course.lessonCount })} · {t("dash.courses.duration", { n: course.durationMin })}
                    </span>
                  </div>
                  <div className="admin-course-actions">
                    <Link className="btn btn-primary" href={`/crm/courses/${course.id}/watch`}>
                      <Icon name="edit_note" />
                      {t("courseAdmin.manageCourse")}
                    </Link>
                    <button
                      className={`course-visibility-control ${course.published ? "is-published" : "is-draft"}`}
                      aria-label={t("courseAdmin.publishToggle")}
                      title={t("courseAdmin.publishToggle")}
                      disabled={togglingId === course.id}
                      onClick={() => void togglePublished(course)}
                    >
                      <Icon name={course.published ? "visibility" : "visibility_off"} />
                      {course.published ? t("act.published.yes") : t("courseAdmin.draft")}
                    </button>
                    <button className="kebab" aria-label={t("common.delete")} onClick={() => void removeCourse(course)}>
                      <Icon name="delete" />
                    </button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <div className="card" style={{ padding: 24 }}>
            <div className="table-empty">{t("courseAdmin.empty")}</div>
          </div>
        ))}

      {/* Table view */}
      {view === "table" && (
        <div className="card">
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 1000 }}>
              <thead>
                <tr>
                  <th>{t("courseAdmin.col.course")}</th>
                  <th>{t("courseAdmin.col.category")}</th>
                  <th>{t("courseAdmin.col.level")}</th>
                  <th>{t("courseAdmin.col.minLevel")}</th>
                  <th>{t("courseAdmin.col.lessons")}</th>
                  <th>{t("courseAdmin.col.duration")}</th>
                  <th>{t("courseAdmin.col.published")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {courses.length ? (
                  courses.map((course) => (
                    <tr key={course.id}>
                      <td>
                        <div className="cn">{course.title}</div>
                        <div className="ce mono">/dashboard/courses/{course.slug}/</div>
                      </td>
                      <td>{t(`dash.courses.tab.${course.category}`)}</td>
                      <td>{t(`dash.courses.level.${course.level}`)}</td>
                      <td>
                        <span className={`badge ${LEVEL_BADGE[course.minLevel]}`}>{t(MEMBER_LEVEL_LABEL_KEYS[course.minLevel])}</span>
                      </td>
                      <td className="mono">{course.lessonCount}</td>
                      <td className="mono">{t("dash.courses.duration", { n: course.durationMin })}</td>
                      <td>
                        <button className={`course-visibility-control ${course.published ? "is-published" : "is-draft"}`} disabled={togglingId === course.id} onClick={() => void togglePublished(course)}>
                          <Icon name={course.published ? "visibility" : "visibility_off"} />
                          {course.published ? t("act.published.yes") : t("courseAdmin.draft")}
                        </button>
                      </td>
                      <td className="row-actions">
                        <Link className="kebab" aria-label={t("courseAdmin.manageCourse")} title={t("courseAdmin.manageCourse")} href={`/crm/courses/${course.id}/watch`}>
                          <Icon name="edit_note" />
                        </Link>
                        <button className="kebab" aria-label={t("common.delete")} onClick={() => void removeCourse(course)}>
                          <Icon name="delete" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8}>
                      <div className="table-empty">{t("courseAdmin.empty")}</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </section>
  );
}
