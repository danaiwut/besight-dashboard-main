"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "../crm/LanguageContext";
import Icon from "../Icon";
import { courseByKey, COURSES, MENTORS, IN_PROGRESS, CHAPTER_TEMPLATE_KEYS, ACTIVE_CHAPTER_INDEX } from "../../lib/courses";

export default function CourseDetailView({ slug }: { slug: string }) {
  const { t } = useLanguage();
  const [comments, setComments] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  const course = courseByKey(slug);
  if (!course) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <p>{t("dash.courses.empty")}</p>
        <Link href="/dashboard/courses" className="btn btn-ghost" style={{ marginTop: 12 }}>
          {t("dash.course.back")}
        </Link>
      </div>
    );
  }

  const others = [...IN_PROGRESS.filter((row) => row.courseKey !== course.key), ...COURSES.filter((c) => c.key !== course.key).map((c) => ({ courseKey: c.key, unit: 1, pct: 0 }))]
    .slice(0, 2);

  function submitComment() {
    const value = draft.trim();
    if (!value) return;
    setComments((cur) => [value, ...cur]);
    setDraft("");
  }

  return (
    <div className="courses-layout">
      <div className="card" style={{ padding: 24 }}>
        <Link href="/dashboard/courses" className="course-detail-back">
          <Icon name="chevron_left" />
          {t("dash.course.back")}
        </Link>

        <div className="course-detail-title-row">
          <div>
            <h1 className="course-detail-title">{t(`dash.courses.${course.key}.title`)}</h1>
            <div className="course-detail-sub">
              {t("dash.course.chapterN", { n: ACTIVE_CHAPTER_INDEX + 1 })} - {t(CHAPTER_TEMPLATE_KEYS[ACTIVE_CHAPTER_INDEX])}
            </div>
          </div>
        </div>

        <div className="course-video-wrap">
          <iframe
            src={`https://www.youtube.com/embed/${course.videoId}`}
            title={t(`dash.courses.${course.key}.title`)}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>

        <div className="course-overview">
          <h4>{t("dash.course.overview")}</h4>
          <p>{t(`dash.courses.${course.key}.desc`)}</p>
          <p>{t("dash.course.overviewExtra1")}</p>
          <p>{t("dash.course.overviewExtra2")}</p>
        </div>

        <div className="course-comments">
          <h4>{t("dash.course.comments", { n: comments.length })}</h4>
          <div className="course-comment-form">
            <input
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitComment()}
              placeholder={t("dash.course.writeComment")}
            />
            <button type="button" className="btn btn-primary" onClick={submitComment}>
              {t("dash.course.commentBtn")}
            </button>
          </div>
          {comments.length > 0 && (
            <div className="course-comment-list">
              {comments.map((c, i) => (
                <div className="course-comment-item" key={i}>
                  {c}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="profile-col-side">
        <div className="card" style={{ padding: 20 }}>
          <div className="course-chapter-head">
            <div>
              <div className="panel-section-title" style={{ marginBottom: 2 }}>
                {t("dash.course.chapterTitle")}
              </div>
              <div className="course-chapter-next">{t("dash.course.nextChapter", { n: ACTIVE_CHAPTER_INDEX + 2, title: t(CHAPTER_TEMPLATE_KEYS[Math.min(ACTIVE_CHAPTER_INDEX + 1, CHAPTER_TEMPLATE_KEYS.length - 1)]) })}</div>
            </div>
            <button type="button" className="course-chapter-seeall">
              {t("dash.course.seeAll")}
            </button>
          </div>
          <div className="course-chapter-list">
            {CHAPTER_TEMPLATE_KEYS.map((chapterKey, i) => {
              const status = i < ACTIVE_CHAPTER_INDEX ? "done" : i === ACTIVE_CHAPTER_INDEX ? "active" : "locked";
              return (
                <div className={`course-chapter-item is-${status}`} key={chapterKey}>
                  <span className="course-chapter-num">{status === "done" ? <Icon name="check" /> : i + 1}</span>
                  <span className="course-chapter-label">{t(chapterKey)}</span>
                  {status === "locked" && <Icon name="lock" className="course-chapter-lock" />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="panel-section-title" style={{ marginBottom: 2 }}>
            {t("dash.course.otherClass")}
          </div>
          <div className="course-other-sub">{t("dash.course.otherClassSub")}</div>
          <div className="course-other-list">
            {others.map((row, i) => {
              const other = courseByKey(row.courseKey)!;
              const mentor = MENTORS[i % MENTORS.length];
              return (
                <Link className="course-other-item" href={`/dashboard/courses/${other.key}`} key={other.key}>
                  <span className={`course-thumb ${other.color}`} style={{ width: 56, height: 56, borderRadius: 10 }}>
                    <Icon name={other.icon} style={{ fontSize: 26 }} />
                  </span>
                  <span className="course-other-info">
                    <div className="course-other-title">{t(`dash.courses.${other.key}.title`)}</div>
                    <div className="course-other-pct">{t("dash.course.courseProgress", { n: row.pct })}</div>
                    <div className="reward-card-track" style={{ marginTop: 4 }}>
                      <span className="reward-card-fill" style={{ width: `${row.pct}%` }} />
                    </div>
                    <div className="course-other-mentor">
                      <span className="course-mentor-avatar" style={{ width: 18, height: 18 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- static export, small local demo avatar */}
                        <img src={`/img/avatars/avatar-${mentor.avatar}.png`} alt={mentor.name} />
                      </span>
                      {mentor.name}
                    </div>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
