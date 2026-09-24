"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCrm, fmtDate } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { TableSkeleton } from "../../../components/crm/Skeletons";
import Drawer from "../../../components/crm/Drawer";
import ActivityForm, { type ActivityFormHandle } from "../../../components/crm/ActivityForm";
import ActivityParticipants from "../../../components/crm/ActivityParticipants";
import { apiCall } from "../../../lib/crmApi";
import type { ActivityDto, ActivityStatus } from "../../../lib/activities";
import Icon from "../../../components/Icon";

const STATUS_BADGE: Record<ActivityStatus, string> = {
  upcoming: "pending",
  live: "active",
  finished: "suspended",
};

export default function CrmActivitiesPage() {
  const { t } = useLanguage();
  const { toast, log, dataVersion, crmDataStatus } = useCrm();
  const [activities, setActivities] = useState<ActivityDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState<{ activity: ActivityDto | null } | null>(null);
  const [participantsFor, setParticipantsFor] = useState<ActivityDto | null>(null);
  const formRef = useRef<ActivityFormHandle>(null);

  const load = useCallback(async () => {
    try {
      const payload = await apiCall<{ activities: ActivityDto[] }>("/api/crm/activities/", "GET");
      setActivities(payload.activities);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("act.toast.loadFailed"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (crmDataStatus === "loading") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [crmDataStatus, dataVersion, load]);

  function applySaved(saved: ActivityDto) {
    setActivities((cur) => {
      const exists = cur.some((a) => a.id === saved.id);
      const next = exists ? cur.map((a) => (a.id === saved.id ? saved : a)) : [...cur, saved];
      return [...next].sort((a, b) => a.sortOrder - b.sortOrder || b.startDate.localeCompare(a.startDate));
    });
  }

  async function remove(activity: ActivityDto) {
    if (!window.confirm(`${t("common.delete")}: ${activity.title}?`)) return;
    try {
      await apiCall(`/api/crm/activities/${activity.id}/`, "DELETE");
      setActivities((cur) => cur.filter((a) => a.id !== activity.id));
      log({ actor: "Admin", action: "Activity Removed", description: `Activity "${activity.title}" removed.` });
      toast(t("act.toast.removed"));
    } catch (removeError) {
      toast(removeError instanceof Error ? removeError.message : "Unable to delete activity");
    }
  }

  const overview = useMemo(() => ({
    live: activities.filter((activity) => activity.status === "live").length,
    upcoming: activities.filter((activity) => activity.status === "upcoming").length,
    registrations: activities.reduce((total, activity) => total + activity.traders, 0),
  }), [activities]);

  if (crmDataStatus === "loading" || loading) {
    return (
      <section className="panel is-active">
        <TableSkeleton cols={6} rows={5} minWidth={900} />
      </section>
    );
  }

  return (
    <section className="panel is-active crm-operations-page">
      <div className="crm-page-command">
        <div>
          <span className="crm-page-eyebrow"><Icon name="emoji_events" /> {t("title.activities")}</span>
          <p>{t("sub.activities")}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setDrawer({ activity: null })}>
          <Icon name="add" />
          {t("act.add")}
        </button>
      </div>
      <div className="crm-kpi-row">
        <div><Icon name="bolt" /><strong>{overview.live}</strong><span>{t("act.status.live")}</span></div>
        <div><Icon name="event_upcoming" /><strong>{overview.upcoming}</strong><span>{t("act.status.upcoming")}</span></div>
        <div><Icon name="groups" /><strong>{overview.registrations.toLocaleString()}</strong><span>{t("act.col.traders")}</span></div>
      </div>

      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16, color: "var(--red)" }}>
          {error}
        </div>
      )}

      <div className="card crm-data-card activity-data-card">
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>{t("act.col.activity")}</th>
                <th>{t("act.col.status")}</th>
                <th>{t("act.col.period")}</th>
                <th>{t("act.col.traders")}</th>
                <th>{t("act.col.prize")}</th>
                <th>{t("act.col.published")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activities.length ? (
                activities.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="cn">{a.title}</div>
                      <div className="ce mono">/dashboard/activities/{a.slug}/</div>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[a.status]}`}>{t(`act.status.${a.status}`)}</span>
                      {a.mode !== "registered" && (
                        <span className="badge pending" style={{ marginLeft: 6 }} title={t("act.mode.legacyHint")}>{t("act.mode.legacy")}</span>
                      )}
                      {a.winnersFinalizedAt && (
                        <span className="badge active" style={{ marginLeft: 6 }}>{t("act.finalized")}</span>
                      )}
                    </td>
                    <td className="mono">
                      {fmtDate(a.startDate)} – {fmtDate(a.endDate)}
                    </td>
                    <td className="mono">{a.traders.toLocaleString()}</td>
                    <td className="mono">${a.prizePool.toFixed(2)}</td>
                    <td>
                      <span className={`badge ${a.published ? "active" : "suspended"}`}>
                        {a.published ? t("act.published.yes") : t("act.published.no")}
                      </span>
                    </td>
                    <td className="row-actions">
                      <button className="kebab" aria-label={t("act.participants.view")} title={t("act.participants.view")} onClick={() => setParticipantsFor(a)}>
                        <Icon name="groups" />
                      </button>
                      <button className="kebab" aria-label={t("common.edit")} onClick={() => setDrawer({ activity: a })}>
                        <Icon name="edit" />
                      </button>
                      <button className="kebab" aria-label={t("common.delete")} onClick={() => void remove(a)}>
                        <Icon name="delete" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                    <div className="table-empty">{t("act.empty")}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer
        open={!!drawer}
        title={drawer?.activity ? t("act.drawer.edit") : t("act.drawer.add")}
        onClose={() => setDrawer(null)}
        body={drawer ? <ActivityForm ref={formRef} activity={drawer.activity} onSaved={applySaved} onDone={() => setDrawer(null)} /> : null}
        foot={
          drawer && (
            <>
              <button className="btn btn-ghost" onClick={() => setDrawer(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={() => formRef.current?.save()}>
                {drawer.activity ? t("common.saveChanges") : t("act.add")}
              </button>
            </>
          )
        }
      />
      <Drawer
        open={!!participantsFor}
        title={t("act.participants.title")}
        onClose={() => setParticipantsFor(null)}
        body={participantsFor ? <ActivityParticipants activity={participantsFor} onClose={() => setParticipantsFor(null)} /> : null}
        foot={
          participantsFor && (
            <button className="btn btn-ghost" onClick={() => setParticipantsFor(null)}>
              {t("common.close")}
            </button>
          )
        }
      />
    </section>
  );
}
