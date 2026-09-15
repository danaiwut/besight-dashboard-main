"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "../../../components/crm/LanguageContext";
import Icon from "../../../components/Icon";
import { TABS, COURSES, MENTORS, IN_PROGRESS, type Category } from "../../../lib/courses";

const DOW_KEYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function currentWeek() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { date: d.getDate(), isToday: d.toDateString() === today.toDateString() };
  });
}

function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="course-stars">
      {Array.from({ length: 5 }, (_, i) => {
        const name = i < full ? "star" : i === full && half ? "star_half" : "star_outline";
        return <Icon key={i} name={name} />;
      })}
      <span className="course-rating-num">{rating.toFixed(1)}</span>
    </span>
  );
}

export default function DashboardCoursesPage() {
  const { t, lang } = useLanguage();
  const [tab, setTab] = useState<Category>("all");
  const week = useMemo(() => currentWeek(), []);
  const monthLabel = useMemo(
    () => new Date().toLocaleDateString(lang === "th" ? "th-TH" : "en-US", { month: "long", year: "numeric" }),
    [lang]
  );

  const filtered = tab === "all" ? COURSES : COURSES.filter((c) => c.category === tab);

  return (
    <div className="courses-layout">
      <div className="card" style={{ padding: 24 }}>
        <div className="comp-tabs">
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

        <div className="course-list">
          {filtered.length ? (
            filtered.map((course) => (
              <div className="course-card" key={course.key}>
                <span className={`course-thumb ${course.color}`}>
                  <Icon name={course.icon} />
                </span>
                <div className="course-body">
                  <div className="course-top-row">
                    <div>
                      <div className="course-title">{t(`dash.courses.${course.key}.title`)}</div>
                      <div className="course-desc">{t(`dash.courses.${course.key}.desc`)}</div>
                    </div>
                    <Stars rating={course.rating} />
                  </div>
                  <div className="course-meta">
                    <Icon name="play_circle" />
                    {t("dash.courses.lessons", { n: course.lessons })}
                  </div>
                  <div className="course-bottom-row">
                    <div className="course-tags">
                      {course.tags.map((tag) => (
                        <span className="course-tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    <Link className="btn btn-primary btn-sm" href={`/dashboard/courses/${course.key}`}>
                      {t("dash.courses.watch")}
                      <Icon name="arrow_forward" />
                    </Link>
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
          <div className="course-calendar-head">
            <span className="m">{monthLabel}</span>
          </div>
          <div className="course-calendar-strip">
            {week.map((d, i) => (
              <div className={`course-calendar-day${d.isToday ? " is-today" : ""}`} key={i}>
                <span>{t(`dash.courses.dow.${DOW_KEYS[i]}`)}</span>
                <span className="n">{d.date}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="panel-section-title" style={{ marginBottom: 4 }}>
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
            {t("dash.courses.progress.title")}
          </div>
          {IN_PROGRESS.map((row) => (
            <div className="course-progress-row" key={row.courseKey}>
              <div className="course-progress-top">
                <span className="course-progress-name">
                  {t(`dash.courses.${row.courseKey}.title`)} · {t("dash.courses.progress.unit", { n: row.unit })}
                </span>
                <span className="course-progress-pct">{row.pct}%</span>
              </div>
              <div className="reward-card-track">
                <span className="reward-card-fill" style={{ width: `${row.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
