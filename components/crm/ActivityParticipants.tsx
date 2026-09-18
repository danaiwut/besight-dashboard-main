"use client";

import { useEffect, useState } from "react";
import { useCrm, fmtDate } from "./CrmContext";
import { useLanguage } from "./LanguageContext";
import { apiCall } from "../../lib/crmApi";
import type { ActivityDto, ActivityEnrollmentDto } from "../../lib/activities";
import Icon from "../Icon";

/** CRM side panel: everyone registered for one activity, their competition
 *  account, and the activity-window lots snapshot. Scores are refreshed here
 *  (or by the cron) from the lot webhook — the CRM's own member totals are
 *  never touched. */
export default function ActivityParticipants({ activity, onClose }: { activity: ActivityDto; onClose: () => void }) {
  const { t } = useLanguage();
  const { toast, log } = useCrm();
  const [rows, setRows] = useState<ActivityEnrollmentDto[] | null>(null);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Reset to the loading state before refetching.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(null);
    apiCall<{ enrollments: ActivityEnrollmentDto[] }>(`/api/crm/activities/${activity.id}/enrollments/`, "GET")
      .then((payload) => { if (!cancelled) { setRows(payload.enrollments); setError(""); } })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load participants"); });
    return () => { cancelled = true; };
  }, [activity.id]);

  async function refreshScores() {
    setRefreshing(true);
    try {
      const result = await apiCall<{ updated: number; failed: number }>(`/api/crm/activities/${activity.id}/scores/refresh/`, "POST");
      const payload = await apiCall<{ enrollments: ActivityEnrollmentDto[] }>(`/api/crm/activities/${activity.id}/enrollments/`, "GET");
      setRows(payload.enrollments);
      toast(t("act.participants.refreshed", { n: result.updated }));
    } catch (refreshError) {
      toast(refreshError instanceof Error ? refreshError.message : "Unable to refresh scores");
    } finally {
      setRefreshing(false);
    }
  }

  async function setVerified(row: ActivityEnrollmentDto, verified: boolean) {
    setWorkingId(row.id);
    try {
      const payload = await apiCall<{ enrollment: ActivityEnrollmentDto }>(
        `/api/crm/activities/${activity.id}/enrollments/${row.id}/`,
        "PATCH",
        { verified },
      );
      setRows((cur) => (cur ? cur.map((r) => (r.id === row.id ? payload.enrollment : r)) : cur));
      log({
        actor: "Admin",
        memberId: row.memberId,
        memberName: row.memberName,
        action: verified ? "Activity Registration Approved" : "Activity Registration Rejected",
        description: `${row.memberName}'s account ${row.tradeId || "—"} ${verified ? "approved" : "rejected"} for "${activity.title}".`,
      });
      toast(t(verified ? "act.participants.approved" : "act.participants.rejected"));
    } catch (updateError) {
      toast(updateError instanceof Error ? updateError.message : "Unable to update registration");
    } finally {
      setWorkingId(null);
    }
  }

  async function remove(row: ActivityEnrollmentDto) {
    if (!window.confirm(t("act.participants.removeConfirm", { name: row.memberName }))) return;
    setRemovingId(row.id);
    try {
      await apiCall(`/api/crm/activities/${activity.id}/enrollments/${row.id}/`, "DELETE");
      setRows((cur) => (cur ? cur.filter((r) => r.id !== row.id) : cur));
      log({ actor: "Admin", memberId: row.memberId, memberName: row.memberName, action: "Activity Registration Removed", description: `${row.memberName} removed from "${activity.title}".` });
      toast(t("act.participants.removed"));
    } catch (removeError) {
      toast(removeError instanceof Error ? removeError.message : "Unable to remove participant");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="drawer-section" style={{ marginTop: 0 }}>
      <div className="drawer-profile" style={{ marginBottom: 14 }}>
        <div>
          <div className="dn">{activity.title}</div>
          <div className="de">
            {t("act.participants.count", { n: rows?.length ?? activity.traders })}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-ghost" disabled={refreshing} onClick={() => void refreshScores()}>
            <Icon name="sync" />
            {refreshing ? "…" : t("act.participants.refresh")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>

      {error ? (
        <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>
      ) : rows === null ? (
        <p className="modal-detail" style={{ textAlign: "left", margin: 0 }}>…</p>
      ) : rows.length === 0 ? (
        <div className="table-empty">{t("act.participants.empty")}</div>
      ) : (
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th>{t("act.participants.col.member")}</th>
                <th>{t("act.participants.col.code")}</th>
                <th>{t("act.participants.col.email")}</th>
                <th>{t("act.participants.col.tradeId")}</th>
                <th>{t("act.participants.col.type")}</th>
                <th>{t("act.participants.col.verified")}</th>
                <th>{t("act.participants.col.lots")}</th>
                <th>{t("act.participants.col.joined")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.memberName}</td>
                  <td className="mono">{row.memberCode}</td>
                  <td>{row.email || "—"}</td>
                  <td className="mono">{row.tradeId || "—"}</td>
                  <td>
                    <span className={`badge ${row.isDemo ? "pending" : "active"}`}>
                      {row.isDemo ? t("act.participants.demo") : t("act.participants.live")}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${row.verified ? "active" : "suspended"}`} title={row.verificationNote || undefined}>
                      {row.verified ? t("act.participants.verified.yes") : t("act.participants.verified.pending")}
                    </span>
                  </td>
                  <td className="mono">{row.lots.toFixed(2)}</td>
                  <td className="mono">{fmtDate(row.joinedAt)}</td>
                  <td className="row-actions">
                    <button
                      className="kebab"
                      aria-label={t("act.participants.approve")}
                      title={t("act.participants.approve")}
                      disabled={workingId === row.id || row.verified}
                      onClick={() => void setVerified(row, true)}
                    >
                      <Icon name="check_circle" />
                    </button>
                    <button
                      className="kebab"
                      aria-label={t("act.participants.reject")}
                      title={t("act.participants.reject")}
                      disabled={workingId === row.id || !row.verified}
                      onClick={() => void setVerified(row, false)}
                    >
                      <Icon name="cancel" />
                    </button>
                    <button className="kebab" aria-label={t("act.participants.remove")} disabled={removingId === row.id} onClick={() => void remove(row)}>
                      <Icon name="delete" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
