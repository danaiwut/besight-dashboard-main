"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useCrm } from "./CrmContext";
import { useLanguage } from "./LanguageContext";
import { apiCall } from "../../lib/crmApi";
import { ACTIVITY_STATUSES, type ActivityDto, type ActivityStatus } from "../../lib/activities";
import DatePickerField from "./DatePickerField";

export type ActivityFormHandle = { save: () => void };

const ActivityForm = forwardRef<ActivityFormHandle, { activity: ActivityDto | null; onSaved: (activity: ActivityDto) => void; onDone: () => void }>(
  function ActivityForm({ activity, onSaved, onDone }, ref) {
    const { toast, log } = useCrm();
    const { t } = useLanguage();
    const isNew = !activity;

    const today = new Date().toISOString().slice(0, 10);
    const [title, setTitle] = useState(activity?.title ?? "");
    const [slug, setSlug] = useState(activity?.slug ?? "");
    const [status, setStatus] = useState<ActivityStatus>(activity?.status ?? "upcoming");
    const [startDate, setStartDate] = useState(activity?.startDate ?? today);
    const [endDate, setEndDate] = useState(activity?.endDate ?? today);
    const [prizePool, setPrizePool] = useState(activity?.prizePool ?? 2000);
    const [coverImage, setCoverImage] = useState(activity?.coverImage ?? "");
    const [visibleFrom, setVisibleFrom] = useState(activity?.visibleFrom ?? "");
    const [registrationOpensAt, setRegistrationOpensAt] = useState(activity?.registrationOpensAt ?? "");
    const [description, setDescription] = useState(activity?.description ?? "");
    const [rules, setRules] = useState((activity?.rules ?? []).join("\n"));
    const [sortOrder, setSortOrder] = useState(activity?.sortOrder ?? 0);
    const [published, setPublished] = useState(activity?.published ?? true);
    const [saving, setSaving] = useState(false);

    useImperativeHandle(ref, () => ({
      save() {
        void saveAsync();
      },
    }));

    async function saveAsync() {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        toast(t("act.toast.titleRequired"));
        return;
      }
      if (!startDate || !endDate) {
        toast(t("act.toast.datesRequired"));
        return;
      }
      if (startDate > endDate) {
        toast(t("act.form.endDate") + " < " + t("act.form.startDate"));
        return;
      }
      setSaving(true);
      const payload = {
        title: trimmedTitle,
        slug: slug.trim(),
        status,
        startDate,
        endDate,
        prizePool,
        coverImage,
        visibleFrom,
        registrationOpensAt,
        description: description.trim(),
        rules,
        sortOrder,
        published,
      };
      try {
        if (isNew) {
          const result = await apiCall<{ activity: ActivityDto }>("/api/crm/activities/", "POST", payload);
          onSaved(result.activity);
          log({ actor: "Admin", memberId: undefined, memberName: undefined, action: "Activity Added", description: `Activity "${result.activity.title}" created (${result.activity.status}).` });
          toast(t("act.toast.added"));
        } else {
          const result = await apiCall<{ activity: ActivityDto }>(`/api/crm/activities/${activity!.id}/`, "PUT", payload);
          onSaved(result.activity);
          log({ actor: "Admin", memberId: undefined, memberName: undefined, action: "Activity Updated", description: `Activity "${result.activity.title}" updated (${result.activity.status}).` });
          toast(t("act.toast.updated"));
        }
        onDone();
      } catch (error) {
        toast(error instanceof Error ? error.message : "Unable to save activity");
      } finally {
        setSaving(false);
      }
    }

    function pickImage(file: File | undefined) {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast(t("act.form.coverBadType"));
        return;
      }
      if (file.size > 1_500_000) {
        toast(t("act.form.coverTooLarge"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setCoverImage(String(reader.result || ""));
      reader.readAsDataURL(file);
    }

    return (
      <>
        <div className="field">
          <label>{t("act.form.title")}</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. October Competition 2026" />
        </div>
        <div className="field">
          <label>
            {t("act.form.slug")} <span style={{ color: "var(--text-sub)" }}>{t("act.form.slugHint")}</span>
          </label>
          <input className="input" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="october-2026" />
        </div>
        <div className="field">
          <label>{t("act.col.status")}</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ActivityStatus)}>
            {ACTIVITY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`act.status.${s}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t("act.form.startDate")}</label>
          <DatePickerField value={startDate} onChange={setStartDate} label={t("act.form.startDate")} max={endDate || undefined} />
        </div>
        <div className="field">
          <label>{t("act.form.endDate")}</label>
          <DatePickerField value={endDate} onChange={setEndDate} label={t("act.form.endDate")} min={startDate || undefined} />
        </div>
        <div className="form-grid2">
          <div className="field">
            <label>{t("act.form.visibleFrom")}</label>
            <DatePickerField value={visibleFrom} onChange={setVisibleFrom} label={t("act.form.visibleFrom")} />
          </div>
          <div className="field">
            <label>{t("act.form.registrationOpensAt")}</label>
            <DatePickerField value={registrationOpensAt} onChange={setRegistrationOpensAt} label={t("act.form.registrationOpensAt")} />
          </div>
        </div>
        <div className="field">
          <label>{t("act.form.prizePool")}</label>
          <input className="input" type="number" min={0} step="0.01" value={prizePool} onChange={(e) => setPrizePool(Math.max(0, parseFloat(e.target.value) || 0))} />
        </div>
        <div className="field">
          <label>
            {t("act.form.cover")} <span style={{ color: "var(--text-sub)" }}>{t("act.form.coverHint")}</span>
          </label>
          <input
            className="input"
            value={coverImage.startsWith("data:") ? "" : coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
            placeholder={coverImage.startsWith("data:") ? t("act.form.coverUploaded") : "https://..."}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <input type="file" accept="image/*" onChange={(e) => pickImage(e.target.files?.[0] ?? undefined)} />
            {coverImage && (
              <button type="button" className="btn btn-ghost" onClick={() => setCoverImage("")}>
                {t("act.form.coverRemove")}
              </button>
            )}
          </div>
          {coverImage && (
            // eslint-disable-next-line @next/next/no-img-element -- admin preview of a pasted/uploaded image
            <img src={coverImage} alt="" style={{ marginTop: 10, width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 10 }} />
          )}
        </div>
        <div className="field">
          <label>{t("act.form.description")}</label>
          <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label>
            {t("act.form.rules")} <span style={{ color: "var(--text-sub)" }}>{t("act.form.rulesHint")}</span>
          </label>
          <textarea className="input" rows={5} value={rules} onChange={(e) => setRules(e.target.value)} />
        </div>
        <div className="form-grid2">
          <div className="field">
            <label>{t("act.form.sortOrder")}</label>
            <input className="input" type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)} />
          </div>
          <div className="field">
            <label>{t("act.form.published")}</label>
            <label className="pop-toggle" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> {t("act.form.publishedHint")}
            </label>
          </div>
        </div>
        {saving && <p style={{ fontSize: 12.5, color: "var(--text-sub)" }}>…</p>}
      </>
    );
  }
);

export default ActivityForm;
