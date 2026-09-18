"use client";

import { useState } from "react";
import { useLanguage } from "./LanguageContext";
import Icon from "../Icon";
import LessonPlayer, { fmtTimecode } from "../courses/LessonPlayer";
import type { CourseDetailDto } from "../../lib/courses";

/** Admin preview of the customer WATCH page: the real lesson player, the same
 *  lesson header/nav and the same curriculum sidebar learners see. Read-only —
 *  progress buttons are disabled and nothing is written back. */
export default function CourseWatchView({ course, initialLessonId }: { course: CourseDetailDto; initialLessonId?: number | null }) {
  const { t } = useLanguage();
  const [lessonId, setLessonId] = useState<number | null>(initialLessonId ?? course.lessons[0]?.id ?? null);

  const index = course.lessons.findIndex((row) => row.id === lessonId);
  const lesson = index >= 0 ? course.lessons[index] : null;
  const previous = index > 0 ? course.lessons[index - 1] : null;
  const next = index >= 0 && index < course.lessons.length - 1 ? course.lessons[index + 1] : null;

  if (!course.lessons.length) {
    return <div className="table-empty">{t("courseAdmin.lessonsEmpty")}</div>;
  }

  return (
    <div>
      <div className="badge pending" style={{ marginBottom: 12, display: "inline-flex" }}>
        <Icon name="visibility" style={{ fontSize: 14 }} />
        {t("courseAdmin.previewWatchBadge")}
      </div>

      <div className="lms-player" style={{ gridTemplateColumns: "minmax(0,1fr) 240px" }}>
        <div className="lms-player-main">
          <div className="card lms-video-card">
            {lesson ? <LessonPlayer key={`${lesson.id}:${lesson.startSec}:${lesson.endSec ?? ""}`} lesson={lesson} /> : null}
          </div>

          <div className="card" style={{ padding: 18, marginTop: 12 }}>
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
              <button type="button" className="btn btn-primary" disabled>
                <Icon name="check_circle" />
                {t("dash.courses.markDone")}
              </button>
            </div>

            <div className="lms-player-nav">
              <button type="button" className="btn btn-ghost" disabled={!previous} onClick={() => previous && setLessonId(previous.id)}>
                <Icon name="chevron_left" />
                {t("dash.courses.prevLesson")}
              </button>
              <button type="button" className="btn btn-ghost" disabled={!next} onClick={() => next && setLessonId(next.id)}>
                {t("dash.courses.nextLesson")}
                <Icon name="chevron_right" />
              </button>
            </div>
          </div>
        </div>

        <div className="card lms-player-side">
          <div className="panel-section-title">{t("dash.courses.curriculum")}</div>
          <div className="lms-lesson-list">
            {course.lessons.map((row, i) => (
              <button
                type="button"
                className={`lms-lesson-row${row.id === lesson?.id ? " is-current" : ""}`}
                key={row.id}
                style={{ textAlign: "left", width: "100%", cursor: "pointer" }}
                onClick={() => setLessonId(row.id)}
              >
                <span className="lms-lesson-num">{i + 1}</span>
                <span className="lms-lesson-body">
                  <span className="lms-lesson-title">{row.title}</span>
                  <span className="lms-lesson-meta">
                    {t("dash.courses.duration", { n: row.durationMin })}
                    {row.videoId && row.startSec > 0 && <> · {fmtTimecode(row.startSec)}</>}
                  </span>
                </span>
                <Icon name={row.id === lesson?.id ? "play_circle" : "play_arrow"} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
