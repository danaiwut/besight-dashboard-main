"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLanguage } from "../../../../../components/crm/LanguageContext";
import { useCrm } from "../../../../../components/crm/CrmContext";
import Drawer from "../../../../../components/crm/Drawer";
import { apiCall } from "../../../../../lib/crmApi";
import LessonPlayer, { fmtTimecode, type LessonPlayerHandle } from "../../../../../components/courses/LessonPlayer";
import Icon from "../../../../../components/Icon";
import { COURSE_LEVELS, TABS, type CourseDetailDto, type CourseLessonDto } from "../../../../../lib/courses";
import { MEMBER_LEVELS, MEMBER_LEVEL_LABEL_KEYS, type MemberLevel } from "../../../../../lib/memberLevel";

/* ── Course watch editor ──
   The admin edits lessons directly in the customer watch layout — no popups.
   Play the video, mark the current time as a chapter start/end, split, write
   the script, then save: one PUT per changed lesson. */

type Item = {
  key: string;
  id: number | null;
  title: string;
  sectionTitle: string;
  videoId: string;
  startSec: string;
  endSec: string;
  script: string;
  durationMin: number;
  isPreview: boolean;
  sortOrder: number;
  dirty: boolean;
};

type LearnerProgress = {
  member: { id: number; name: string; displayName: string | null; email: string | null; avatarUrl: string | null; code: string };
  enrolledAt: string;
  completedAt: string | null;
  completedLessons: number;
  lessonCount: number;
  progressPct: number;
  lastLesson: string | null;
  lastActivityAt: string;
};

type LearnerProgressPayload = { summary: { enrolled: number; completed: number; lessonCount: number }; learners: LearnerProgress[] };

function parseTimecode(text: string): number {
  const raw = text.trim();
  if (!raw) return 0;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.max(0, Math.floor(Number(raw)));
  const parts = raw.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return 0;
  return Math.max(0, Math.floor(parts.reduce((total, part) => total * 60 + part, 0)));
}

function toItem(lesson: CourseLessonDto): Item {
  return {
    key: `l${lesson.id}`,
    id: lesson.id,
    title: lesson.title,
    sectionTitle: lesson.sectionTitle ?? "",
    videoId: lesson.videoId ?? "",
    startSec: fmtTimecode(lesson.startSec),
    endSec: lesson.endSec != null ? fmtTimecode(lesson.endSec) : "",
    script: lesson.script ?? "",
    durationMin: lesson.durationMin,
    isPreview: lesson.isPreview,
    sortOrder: lesson.sortOrder,
    dirty: false,
  };
}

export default function CrmCourseWatchEditorPage() {
  const params = useParams<{ id: string }>();
  const courseId = Number(params?.id);
  const { t } = useLanguage();
  const { toast } = useCrm();
  const playerRef = useRef<LessonPlayerHandle | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [course, setCourse] = useState<CourseDetailDto | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [courseDirty, setCourseDirty] = useState(false);
  const [learnersOpen, setLearnersOpen] = useState(false);
  const [learners, setLearners] = useState<LearnerProgressPayload | null>(null);
  const [learnersLoading, setLearnersLoading] = useState(false);
  const tempSeed = useRef(0);

  const load = useCallback(async () => {
    try {
      const payload = await apiCall<{ course: CourseDetailDto }>(`/api/crm/courses/${courseId}/preview/`, "GET");
      const nextItems = payload.course.lessons.map(toItem);
      setCourse(payload.course);
      setItems(nextItems);
      setRemovedIds([]);
      setCourseDirty(false);
      setSelectedKey(nextItems[0]?.key ?? null);
    } catch (loadError) {
      toast(loadError instanceof Error ? loadError.message : "Unable to load course");
    } finally {
      setLoading(false);
    }
  }, [courseId, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load; the async fetch sets state in its callback
    void load();
  }, [load]);

  const selectedIndex = items.findIndex((item) => item.key === selectedKey);
  const selected = selectedIndex >= 0 ? items[selectedIndex] : null;
  const dirtyCount = items.filter((item) => item.dirty).length + removedIds.length + (courseDirty ? 1 : 0);

  function patchCourse(patch: Partial<CourseDetailDto>) {
    setCourse((current) => (current ? { ...current, ...patch } : current));
    setCourseDirty(true);
  }

  async function openLearners() {
    setLearnersOpen(true);
    setLearnersLoading(true);
    try {
      const payload = await apiCall<LearnerProgressPayload>(`/api/crm/courses/${courseId}/learners/`, "GET");
      setLearners(payload);
    } catch (loadError) {
      toast(loadError instanceof Error ? loadError.message : "Unable to load learner progress");
    } finally {
      setLearnersLoading(false);
    }
  }

  const playerLesson: CourseLessonDto | null = useMemo(() => {
    if (!selected) return null;
    return {
      id: selected.id ?? -1,
      title: selected.title,
      videoId: selected.videoId.trim() || undefined,
      startSec: parseTimecode(selected.startSec),
      endSec: selected.endSec.trim() ? parseTimecode(selected.endSec) : null,
      script: selected.script,
      durationMin: selected.durationMin,
      sortOrder: selected.sortOrder,
      isPreview: selected.isPreview,
      completed: false,
    };
  }, [selected]);

  function patchSelected(patch: Partial<Item>) {
    if (!selected) return;
    setItems((cur) => cur.map((item) => (item.key === selected.key ? { ...item, ...patch, dirty: true } : item)));
  }

  function currentTime(): number | null {
    const seconds = Math.round(playerRef.current?.getCurrentTime?.() ?? 0);
    if (!seconds) {
      toast(t("courseAdmin.playerHint"));
      return null;
    }
    return seconds;
  }

  function markIn() {
    const seconds = currentTime();
    if (seconds == null || !selected) return;
    patchSelected({ startSec: fmtTimecode(seconds) });
  }

  function markOut() {
    const seconds = currentTime();
    if (seconds == null || !selected) return;
    const start = parseTimecode(selected.startSec);
    patchSelected({
      endSec: fmtTimecode(seconds),
      ...(seconds > start ? { durationMin: Math.max(1, Math.round((seconds - start) / 60)) } : {}),
    });
  }

  function playRange() {
    if (!selected) return;
    playerRef.current?.seekTo(parseTimecode(selected.startSec));
  }

  /** Video-editor style split: end this chapter at the playhead and start a
   *  new one there. */
  function splitHere() {
    const seconds = currentTime();
    if (seconds == null || !selected) return;
    const start = parseTimecode(selected.startSec);
    if (seconds <= start) {
      toast(t("courseAdmin.playerHint"));
      return;
    }
    const newKey = `t${++tempSeed.current}`;
    const newItem: Item = {
      key: newKey,
      id: null,
      title: t("courseAdmin.newLesson"),
      sectionTitle: selected.sectionTitle,
      videoId: selected.videoId,
      startSec: fmtTimecode(seconds),
      endSec: "",
      script: "",
      durationMin: 5,
      isPreview: false,
      sortOrder: selectedIndex + 1,
      dirty: true,
    };
    setItems((cur) => {
      const copy = [...cur];
      copy[selectedIndex] = { ...selected, endSec: fmtTimecode(seconds), durationMin: Math.max(1, Math.round((seconds - start) / 60)), dirty: true };
      copy.splice(selectedIndex + 1, 0, newItem);
      return copy.map((item, index) => ({ ...item, sortOrder: index }));
    });
    setSelectedKey(newKey);
  }

  function addLesson() {
    const last = items[items.length - 1];
    const newKey = `t${++tempSeed.current}`;
    const item: Item = {
      key: newKey,
      id: null,
      title: t("courseAdmin.newLesson"),
      sectionTitle: last?.sectionTitle ?? "",
      videoId: last?.videoId ?? "",
      startSec: last?.endSec?.trim() ? last.endSec : "0:00",
      endSec: "",
      script: "",
      durationMin: 5,
      isPreview: false,
      sortOrder: items.length,
      dirty: true,
    };
    setItems((cur) => [...cur, item]);
    setSelectedKey(newKey);
  }

  /** Creates a lesson and takes the editor straight to its YouTube source. */
  function importYouTubeLesson() {
    addLesson();
    window.setTimeout(() => videoInputRef.current?.focus(), 0);
  }

  async function pasteYouTubeUrl() {
    if (!selected || !navigator.clipboard?.readText) return;
    try {
      const url = (await navigator.clipboard.readText()).trim();
      if (url) patchSelected({ videoId: url });
    } catch {
      toast(t("courseAdmin.clipboardUnavailable"));
    }
  }

  function removeLesson(item: Item) {
    if (!window.confirm(t("courseAdmin.lessonRemoveConfirm", { title: item.title }))) return;
    const index = items.findIndex((row) => row.key === item.key);
    setItems((cur) => cur.filter((row) => row.key !== item.key).map((row, i) => ({ ...row, sortOrder: i })));
    if (item.id) setRemovedIds((cur) => [...cur, item.id as number]);
    const nextSelection = items[index + 1] ?? items[index - 1] ?? null;
    setSelectedKey(nextSelection && nextSelection.key !== item.key ? nextSelection.key : null);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((cur) => {
      const copy = [...cur];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy.map((item, i) => ({ ...item, sortOrder: i, dirty: true }));
    });
  }

  async function save() {
    if (!course || dirtyCount === 0) {
      toast(t("courseAdmin.noChanges"));
      return;
    }
    setSaving(true);
    try {
      if (courseDirty) {
        await apiCall(`/api/crm/courses/${course.id}/`, "PUT", {
          title: course.title,
          slug: course.slug,
          description: course.description,
          category: course.category,
          level: course.level,
          minLevel: course.minLevel,
          coverImage: course.coverImage ?? "",
          instructor: course.instructor ?? "",
          sortOrder: course.sortOrder,
          published: course.published,
        });
      }
      for (const id of removedIds) {
        await apiCall(`/api/crm/courses/${course.id}/lessons/${id}/`, "DELETE");
      }
      for (const [index, item] of items.entries()) {
        if (!item.dirty && item.id !== null) continue;
        const body = {
          title: item.title.trim() || t("courseAdmin.newLesson"),
          sectionTitle: item.sectionTitle.trim(),
          videoId: item.videoId.trim(),
          startSec: item.startSec.trim(),
          endSec: item.endSec.trim(),
          script: item.script,
          durationMin: item.durationMin,
          isPreview: item.isPreview,
          sortOrder: index,
        };
        if (item.id) await apiCall(`/api/crm/courses/${course.id}/lessons/${item.id}/`, "PUT", body);
        else await apiCall(`/api/crm/courses/${course.id}/lessons/`, "POST", body);
      }
      await load();
      toast(t("courseAdmin.savedEdits"));
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : "Unable to save changes");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <p className="modal-detail" style={{ textAlign: "left", margin: 0 }}>…</p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <p>{t("courseAdmin.empty")}</p>
        <Link href="/crm/courses/" className="btn btn-ghost" style={{ marginTop: 12 }}>
          <Icon name="arrow_back" />
          {t("courseAdmin.backToCourses")}
        </Link>
      </div>
    );
  }

  return (
    <section className="panel is-active">
      <div className="lms-edit-bar course-editor-bar">
        <div className="lms-edit-bar-left">
          <Link href="/crm/courses/" className="btn btn-ghost btn-sm">
            <Icon name="arrow_back" />
            {t("courseAdmin.backToCourses")}
          </Link>
          <div className="course-editor-title">
            <span>{t("courseAdmin.editWatch")}</span>
            <strong>{course.title}</strong>
            {dirtyCount > 0 && <em>{t("courseAdmin.unsaved", { n: dirtyCount })}</em>}
          </div>
        </div>
        <div className="lms-edit-bar-left">
          <button className="btn btn-ghost btn-sm" onClick={() => void openLearners()}>
            <Icon name="groups" />
            {t("courseAdmin.learnerProgress")}
          </button>
          {items.length > 0 && <button className="btn btn-ghost btn-sm" onClick={importYouTubeLesson}>
            <Icon name="video_library" />
            {t("courseAdmin.importVideo")}
          </button>}
          <a className="btn btn-ghost btn-sm" href={`/dashboard/courses/${course.slug}`} target="_blank" rel="noopener noreferrer">
            <Icon name="open_in_new" />
            {t("courseAdmin.openCustomer")}
          </a>
          <button className="btn btn-primary btn-sm" onClick={() => void save()} disabled={saving || dirtyCount === 0}>
            <Icon name="save" />
            {t("courseAdmin.saveEdits")}
          </button>
        </div>
      </div>

      <div className="card course-settings-card">
        <div className="course-settings-heading">
          <div>
            <div className="panel-section-title">{t("courseAdmin.setupTitle")}</div>
            <p>{t("courseAdmin.setupHint")}</p>
          </div>
          <div className="course-publish-switch" aria-label={t("courseAdmin.col.published")}>
            <button type="button" className={!course.published ? "is-active draft" : ""} onClick={() => patchCourse({ published: false })}>
              <Icon name="edit_note" /> {t("courseAdmin.draft")}
            </button>
            <button type="button" className={course.published ? "is-active published" : ""} onClick={() => patchCourse({ published: true })}>
              <Icon name="visibility" /> {t("act.published.yes")}
            </button>
          </div>
        </div>
        <div className="course-settings-grid">
          <div className="lms-edit-field course-settings-title">
            <label>{t("courseAdmin.field.title")}</label>
            <input className="input lms-edit-title" value={course.title} onChange={(e) => patchCourse({ title: e.target.value })} />
          </div>
          <div className="lms-edit-field">
            <label>{t("courseAdmin.field.slug")}</label>
            <input className="input" value={course.slug} onChange={(e) => patchCourse({ slug: e.target.value })} />
          </div>
          <div className="lms-edit-field course-settings-description">
            <label>{t("courseAdmin.field.description")}</label>
            <textarea className="input" rows={2} value={course.description} onChange={(e) => patchCourse({ description: e.target.value })} />
          </div>
          <div className="lms-edit-field">
            <label>{t("courseAdmin.col.category")}</label>
            <select className="input" value={course.category} onChange={(e) => patchCourse({ category: e.target.value })}>
              {TABS.filter((tab) => tab !== "all").map((tab) => <option key={tab} value={tab}>{t(`dash.courses.tab.${tab}`)}</option>)}
            </select>
          </div>
          <div className="lms-edit-field">
            <label>{t("courseAdmin.col.level")}</label>
            <select className="input" value={course.level} onChange={(e) => patchCourse({ level: e.target.value as CourseDetailDto["level"] })}>
              {COURSE_LEVELS.map((level) => <option key={level} value={level}>{t(`dash.courses.level.${level}`)}</option>)}
            </select>
          </div>
          <div className="lms-edit-field course-audience-field">
            <label>{t("courseAdmin.audience")}</label>
            <select className="input" value={course.minLevel} onChange={(e) => patchCourse({ minLevel: e.target.value as MemberLevel })}>
              {MEMBER_LEVELS.map((level) => <option key={level} value={level}>{t(`courseAdmin.audience.${level}`, { level: t(MEMBER_LEVEL_LABEL_KEYS[level]) })}</option>)}
            </select>
            <small>{t("courseAdmin.audienceHint")}</small>
          </div>
        </div>
      </div>

      {items.length > 0 ? <div className="lms-player">
        <div className="lms-player-main">
          <div className="card lms-video-card">
            {playerLesson && playerLesson.videoId ? (
              <LessonPlayer ref={playerRef} lesson={playerLesson} />
            ) : (
              <div className="lms-video lms-video-empty">
                <Icon name="smart_display" />
                <span>{t("dash.courses.noVideo")}</span>
              </div>
            )}
          </div>

          {selected ? (
            <div className="card" style={{ padding: 20, marginTop: 14 }}>
              <div className="lms-edit-row" style={{ marginBottom: 12 }}>
                <span className="lms-edit-chip">
                  {t("dash.courses.lesson", { n: selectedIndex + 1 })} / {items.length}
                </span>
                <span className="lms-edit-chip">·</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={playRange}>
                  <Icon name="play_circle" />
                  {t("courseAdmin.playRange")}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={splitHere}>
                  <Icon name="content_cut" />
                  {t("courseAdmin.splitHere")}
                </button>
                <span style={{ marginLeft: "auto" }}>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeLesson(selected)}>
                    <Icon name="delete" />
                    {t("common.delete")}
                  </button>
                </span>
              </div>

              <div className="lms-edit-field">
                <label>{t("courseAdmin.field.lessonTitle")}</label>
                <input className="input lms-edit-title" value={selected.title} onChange={(e) => patchSelected({ title: e.target.value })} />
              </div>

              <div className="lms-edit-row" style={{ marginTop: 12 }}>
                <div className="lms-edit-field" style={{ flex: "1 1 200px" }}>
                  <label>{t("courseAdmin.field.section")}</label>
                  <input className="input" value={selected.sectionTitle} onChange={(e) => patchSelected({ sectionTitle: e.target.value })} placeholder="ปูพื้นฐาน" />
                </div>
                <div className="lms-edit-field" style={{ flex: "2 1 260px" }}>
                  <label>{t("courseAdmin.field.videoId")}</label>
                  <div className="course-video-source">
                    <input ref={videoInputRef} className="input" value={selected.videoId} onChange={(e) => patchSelected({ videoId: e.target.value })} placeholder="https://youtube.com/watch?v=..." />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void pasteYouTubeUrl()}>
                      <Icon name="content_paste" />
                      {t("courseAdmin.pasteLink")}
                    </button>
                  </div>
                  <small className="course-video-source-hint">{t("courseAdmin.videoSourceHint")}</small>
                </div>
              </div>

              <div className="lms-edit-row" style={{ marginTop: 12 }}>
                <div className="lms-edit-field">
                  <label>{t("courseAdmin.field.startTime")}</label>
                  <input className="input lms-edit-time" value={selected.startSec} onChange={(e) => patchSelected({ startSec: e.target.value })} />
                </div>
                <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-end" }} onClick={markIn}>
                  <Icon name="first_page" />
                  {t("courseAdmin.markIn")}
                </button>
                <div className="lms-edit-field">
                  <label>{t("courseAdmin.field.endTime")}</label>
                  <input className="input lms-edit-time" value={selected.endSec} onChange={(e) => patchSelected({ endSec: e.target.value })} placeholder="—" />
                </div>
                <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-end" }} onClick={markOut}>
                  <Icon name="last_page" />
                  {t("courseAdmin.markOut")}
                </button>
                <div className="lms-edit-field">
                  <label>{t("courseAdmin.field.duration")}</label>
                  <input className="input lms-edit-time" type="number" min={0} value={selected.durationMin} onChange={(e) => patchSelected({ durationMin: Math.max(0, parseInt(e.target.value) || 0) })} />
                </div>
                <label className="pop-toggle" style={{ alignSelf: "flex-end" }}>
                  <input type="checkbox" checked={selected.isPreview} onChange={(e) => patchSelected({ isPreview: e.target.checked })} />
                  {t("dash.courses.preview")}
                </label>
              </div>
              <p className="lms-edit-hint">{t("courseAdmin.playerHint")}</p>

              <div className="lms-edit-field" style={{ marginTop: 12 }}>
                <label>{t("dash.courses.script")}</label>
                <textarea className="input" rows={6} value={selected.script} onChange={(e) => patchSelected({ script: e.target.value })} />
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 24, marginTop: 14 }}>
              <div className="table-empty">{t("courseAdmin.lessonsEmpty")}</div>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                <button className="btn btn-primary" onClick={addLesson}>
                  <Icon name="add" />
                  {t("courseAdmin.addLesson")}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="card lms-player-side">
          <div className="panel-section-title">{t("dash.courses.curriculum")}</div>
          <div className="lms-lesson-list">
            {items.map((item, index) => (
              <div className={`lms-edit-item${item.key === selectedKey ? " is-current" : ""}${item.dirty ? " is-dirty" : ""}`} key={item.key}>
                <button type="button" className="lms-lesson-num" style={{ border: 0, cursor: "pointer" }} onClick={() => setSelectedKey(item.key)}>
                  {index + 1}
                </button>
                <button type="button" style={{ flex: 1, minWidth: 0, background: "none", border: 0, textAlign: "left", color: "inherit", cursor: "pointer" }} onClick={() => setSelectedKey(item.key)}>
                  <span className="lms-lesson-title">{item.title || t("courseAdmin.newLesson")}</span>
                  <span className="lms-lesson-meta">
                    {item.endSec ? `${item.startSec} – ${item.endSec}` : item.startSec}
                    {item.sectionTitle ? ` · ${item.sectionTitle}` : ""}
                  </span>
                </button>
                <span className="row-actions">
                  <button className="kebab" aria-label={t("courseAdmin.moveUp")} disabled={index === 0} onClick={() => move(index, -1)}>
                    <Icon name="arrow_upward" />
                  </button>
                  <button className="kebab" aria-label={t("courseAdmin.moveDown")} disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                    <Icon name="arrow_downward" />
                  </button>
                </span>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} onClick={addLesson}>
            <Icon name="add" />
            {t("courseAdmin.addLesson")}
          </button>
        </div>
      </div> : (
        <div className="card course-editor-empty">
          <div className="course-editor-empty-icon"><Icon name="video_library" /></div>
          <div>
            <h2>{t("courseAdmin.emptyCourseTitle")}</h2>
            <p>{t("courseAdmin.emptyCourseHint")}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={importYouTubeLesson}>
            <Icon name="video_library" />
            {t("courseAdmin.importVideo")}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addLesson}>{t("courseAdmin.addFirstLesson")}</button>
          <div className="course-editor-steps" aria-label={t("courseAdmin.setupTitle")}>
            <span className="is-done"><b>1</b>{t("courseAdmin.step.course")}</span>
            <span><b>2</b>{t("courseAdmin.step.lesson")}</span>
            <span><b>3</b>{t("courseAdmin.step.publish")}</span>
          </div>
        </div>
      )}
      <Drawer
        open={learnersOpen}
        title={t("courseAdmin.learnerProgress")}
        onClose={() => setLearnersOpen(false)}
        body={learnersLoading ? (
          <p className="modal-detail">…</p>
        ) : learners ? (
          <div className="course-learners">
            <div className="course-learner-stats">
              <div><strong>{learners.summary.enrolled}</strong><span>{t("courseAdmin.enrolled")}</span></div>
              <div><strong>{learners.summary.completed}</strong><span>{t("courseAdmin.completed")}</span></div>
              <div><strong>{learners.summary.lessonCount}</strong><span>{t("courseAdmin.totalLessons")}</span></div>
            </div>
            {learners.learners.length ? learners.learners.map((learner) => (
              <article className="course-learner-row" key={learner.member.id}>
                <div className="course-learner-avatar">
                  {learner.member.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- member-supplied avatar URL
                    <img src={learner.member.avatarUrl} alt="" />
                  ) : (learner.member.displayName ?? learner.member.name).slice(0, 1)}
                </div>
                <div className="course-learner-main">
                  <div className="course-learner-name">{learner.member.displayName ?? learner.member.name}</div>
                  <div className="course-learner-meta">{learner.member.email ?? learner.member.code}</div>
                  <div className="course-learner-progress"><span style={{ width: `${learner.progressPct}%` }} /></div>
                  <div className="course-learner-meta">
                    {t("courseAdmin.lessonProgress", { done: learner.completedLessons, total: learner.lessonCount })}
                    {learner.lastLesson ? ` · ${t("courseAdmin.lastLesson", { title: learner.lastLesson })}` : ""}
                  </div>
                </div>
                <div className={`course-learner-status${learner.completedAt ? " is-complete" : ""}`}>
                  <strong>{learner.progressPct}%</strong>
                  <span>{learner.completedAt ? t("courseAdmin.completed") : t("courseAdmin.inProgress")}</span>
                </div>
              </article>
            )) : <div className="table-empty">{t("courseAdmin.noLearners")}</div>}
          </div>
        ) : null}
      />
    </section>
  );
}
