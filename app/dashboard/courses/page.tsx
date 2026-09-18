"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { lot } from "../../../components/crm/CrmContext";
import { apiCall } from "../../../lib/crmApi";
import Icon from "../../../components/Icon";
import { MENTORS, TABS, type Category, type CourseDto } from "../../../lib/courses";
import { MEMBER_LEVEL_LABEL_KEYS, type MemberLevel } from "../../../lib/memberLevel";

export default function DashboardCoursesPage() {
  const { t, lang } = useLanguage();
  const [tab, setTab] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const [courses, setCourses] = useState<CourseDto[]>([]);
  const [level, setLevel] = useState<MemberLevel>("basic");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const payload = await apiCall<{ courses: CourseDto[]; level: MemberLevel }>("/api/courses/", "GET");
      setCourses(payload.courses);
      setLevel(payload.level);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load courses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load; the async fetch sets state in its callback
    void load();
  }, [load]);

  const monthLabel = useMemo(
    () => new Date().toLocaleDateString(lang === "th" ? "th-TH" : "en-US", { month: "long", year: "numeric" }),
    [lang],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return courses
      .filter((course) => tab === "all" || course.category === tab)
      .filter((course) => !q || `${course.title} ${course.description} ${course.instructor ?? ""}`.toLowerCase().includes(q));
  }, [courses, tab, query]);

  const inProgress = courses.filter((course) => course.enrolled && course.progressPct > 0 && course.progressPct < 100);

  return (
    <div className="courses-layout">
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <div className="comp-tabs" style={{ flex: 1, marginBottom: 0 }}>
            {TABS.map((tabKey) => (
              <button
                key={tabKey}
                type="button"
                className={`comp-tab${tab === tabKey ? " is-active" : ""}`}
                onClick={() => setTab(tabKey)}
              >
                {t(`dash.courses.tab.${tabKey}`)}
              </button>
            ))}
          </div>
          <div className="search" style={{ flex: "0 1 240px" }}>
            <Icon name="search" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("dash.courses.search")} aria-label={t("dash.courses.search")} />
          </div>
        </div>

        <div className="course-list">
          {loading ? (
            <div className="comp-empty">…</div>
          ) : error ? (
            <div className="comp-empty">{error}</div>
          ) : filtered.length ? (
            filtered.map((course) => (
              <div className="course-card" key={course.id}>
                {course.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin-provided cover image
                  <img className="course-cover" src={course.coverImage} alt="" />
                ) : (
                  <span className="course-thumb c1">
                    <Icon name="school" />
                  </span>
                )}
                <div className="course-body">
                  <div className="course-top-row">
                    <div>
                      <div className="course-title">{course.title}</div>
                      <div className="course-desc">{course.description}</div>
                    </div>
                    <span className={`badge ${course.progressPct === 100 ? "active" : "pending"}`}>
                      {t(`dash.courses.level.${course.level}`)}
                    </span>
                  </div>
                  <div className="course-meta">
                    <Icon name="play_circle" />
                    {t("dash.courses.lessons", { n: course.lessonCount })}
                    <span>·</span>
                    <Icon name="schedule" />
                    {t("dash.courses.duration", { n: course.durationMin })}
                    {course.instructor && (
                      <>
                        <span>·</span>
                        <Icon name="person" />
                        {course.instructor}
                      </>
                    )}
                  </div>
                  {course.enrolled && (
                    <div style={{ marginTop: 10 }}>
                      <div className="course-progress-top">
                        <span className="course-progress-name">
                          {t("dash.courses.progressLabel", { done: course.completedCount, total: course.lessonCount })}
                        </span>
                        <span className="course-progress-pct">{course.progressPct}%</span>
                      </div>
                      <div className="reward-card-track">
                        <span className="reward-card-fill" style={{ width: `${course.progressPct}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="course-bottom-row">
                    <div className="course-tags">
                      <span className="course-tag">{t(`dash.courses.tab.${course.category}`)}</span>
                      <span className={`course-tag${course.locked ? "" : ""}`} style={course.locked ? { color: "var(--red)" } : undefined}>
                        <Icon name={course.locked ? "lock" : "workspace_premium"} style={{ fontSize: 12 }} /> {t(MEMBER_LEVEL_LABEL_KEYS[course.minLevel])}
                      </span>
                    </div>
                    {course.locked ? (
                      <button type="button" className="btn btn-ghost btn-sm" disabled title={t("dash.courses.levelRequired", { level: t(MEMBER_LEVEL_LABEL_KEYS[course.minLevel]) })}>
                        <Icon name="lock" />
                        {t(MEMBER_LEVEL_LABEL_KEYS[course.minLevel])}
                      </button>
                    ) : (
                      <Link className="btn btn-primary btn-sm" href={`/dashboard/courses/${course.slug}`}>
                        {course.progressPct === 100
                          ? t("dash.courses.review")
                          : course.enrolled
                            ? t("dash.courses.continue")
                            : t("dash.courses.watch")}
                        <Icon name="arrow_forward" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="comp-empty">{t("dash.courses.empty")}</div>
          )}
        </div>
      </div>

      <div className="profile-col-side">
        <div className="card" style={{ padding: 20 }}>
          <div className="panel-section-title" style={{ marginBottom: 10 }}>
            {t("dash.courses.myCourses")}
          </div>
          {inProgress.length ? (
            inProgress.map((course) => (
              <div className="course-progress-row" key={course.id}>
                <div className="course-progress-top">
                  <Link className="course-progress-name" href={`/dashboard/courses/${course.slug}`}>
                    {course.title}
                  </Link>
                  <span className="course-progress-pct">{course.progressPct}%</span>
                </div>
                <div className="reward-card-track">
                  <span className="reward-card-fill" style={{ width: `${course.progressPct}%` }} />
                </div>
                <Link className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} href={`/dashboard/courses/${course.slug}`}>
                  {t("dash.courses.continue")}
                  <Icon name="arrow_forward" />
                </Link>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 13, color: "var(--text-sub)" }}>{t("dash.courses.myCoursesEmpty")}</div>
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="panel-section-title" style={{ marginBottom: 6 }}>
            {t("dash.courses.yourLevel")}
          </div>
          <span className={`badge ${level === "premium" ? "active" : level === "standard" ? "pending" : "suspended"}`}>
            <Icon name="workspace_premium" style={{ fontSize: 14 }} />
            {t(MEMBER_LEVEL_LABEL_KEYS[level])}
          </span>
          <p style={{ fontSize: 12, color: "var(--text-sub)", margin: "10px 0 0" }}>{t("dash.courses.levelHint")}</p>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="course-calendar-head">
            <span className="m">{monthLabel}</span>
          </div>
          <div className="panel-section-title" style={{ marginBottom: 4, fontSize: 13 }}>
            {t("dash.courses.mentors.title")}
          </div>
          {MENTORS.map((mentor) => (
            <div className="course-mentor-row" key={mentor.name}>
              <span className="course-mentor-avatar">
                {/* eslint-disable-next-line @next/next/no-img-element -- static export, small local demo avatar */}
                <img src={`/img/avatars/avatar-${mentor.avatar}.png`} alt={mentor.name} />
              </span>
              <span className="course-mentor-info">
                <div className="course-mentor-name">{mentor.name}</div>
                <div className="course-mentor-role">{t(mentor.roleKey)}</div>
              </span>
              <span className="course-mentor-exp">{t("dash.courses.mentors.exp", { n: mentor.exp })}</span>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="panel-section-title" style={{ marginBottom: 4 }}>
            {t("dash.courses.summary.title")}
          </div>
          <div className="drawer-row">
            <span className="k">{t("dash.courses.summary.courses")}</span>
            <span className="v">{courses.length}</span>
          </div>
          <div className="drawer-row">
            <span className="k">{t("dash.courses.summary.lessons")}</span>
            <span className="v">{courses.reduce((sum, course) => sum + course.lessonCount, 0)}</span>
          </div>
          <div className="drawer-row" style={{ borderBottom: "none" }}>
            <span className="k">{t("dash.courses.summary.hours")}</span>
            <span className="v">{lot(Math.round((courses.reduce((sum, course) => sum + course.durationMin, 0) / 60) * 10) / 10)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
