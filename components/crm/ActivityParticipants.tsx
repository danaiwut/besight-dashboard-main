"use client";

import { useEffect, useState } from "react";
import { useCrm, fmtDate } from "./CrmContext";
import { useLanguage } from "./LanguageContext";
import { apiCall } from "../../lib/crmApi";
import { PRIZE_TIERS, type ActivityDto, type ActivityEnrollmentDto, type CompetitionPrizeDto } from "../../lib/activities";
import Icon from "../Icon";

type PrizeDraft = { rankFrom: string; rankTo: string; title: string; valueNote: string };

function defaultPrizeRows(): PrizeDraft[] {
  return PRIZE_TIERS.map((tier) => {
    const [from, to] = tier.rankKey.includes("-") ? tier.rankKey.split("-").map(Number) : [Number(tier.rankKey), Number(tier.rankKey)];
    return { rankFrom: String(from), rankTo: String(to), title: `#${tier.rankKey}`, valueNote: `$${tier.amount.toFixed(2)}` };
  });
}

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
  const [prizes, setPrizes] = useState<CompetitionPrizeDto[] | null>(null);
  const [prizeDrafts, setPrizeDrafts] = useState<PrizeDraft[]>([]);
  const [prizesOpen, setPrizesOpen] = useState(false);
  const [savingPrizes, setSavingPrizes] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<{ winners: Array<{ rank: number; memberName: string; lots: number; prizeTitle: string }>; claimsCreated: number } | null>(null);
  const [finalizedAt, setFinalizedAt] = useState<string | undefined>(activity.winnersFinalizedAt);

  useEffect(() => {
    let cancelled = false;
    // Reset to the loading state before refetching.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(null);
    apiCall<{ enrollments: ActivityEnrollmentDto[] }>(`/api/crm/activities/${activity.id}/enrollments/`, "GET")
      .then((payload) => { if (!cancelled) { setRows(payload.enrollments); setError(""); } })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load participants"); });
    apiCall<{ prizes: CompetitionPrizeDto[] }>(`/api/crm/activities/${activity.id}/prizes/`, "GET")
      .then((payload) => {
        if (cancelled) return;
        setPrizes(payload.prizes);
        setPrizeDrafts(payload.prizes.map((p) => ({ rankFrom: String(p.rankFrom), rankTo: String(p.rankTo), title: p.title, valueNote: p.valueNote ?? "" })));
      })
      .catch(() => undefined);
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

  async function savePrizes() {
    setSavingPrizes(true);
    try {
      const payload = await apiCall<{ prizes: CompetitionPrizeDto[] }>(`/api/crm/activities/${activity.id}/prizes/`, "PUT", {
        prizes: prizeDrafts.map((d) => ({ rankFrom: Number(d.rankFrom), rankTo: Number(d.rankTo), title: d.title.trim(), valueNote: d.valueNote.trim() })),
      });
      setPrizes(payload.prizes);
      toast(t("act.prizes.saved"));
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : "Unable to save prizes");
    } finally {
      setSavingPrizes(false);
    }
  }

  async function finalize() {
    if (!window.confirm(t("act.finalize.confirm", { title: activity.title }))) return;
    setFinalizing(true);
    try {
      const payload = await apiCall<{
        winners: Array<{ rank: number; memberName: string; lots: number; prizeTitle: string }>;
        claimsCreated: number;
      }>(`/api/crm/activities/${activity.id}/finalize/`, "POST");
      setFinalizeResult({ winners: payload.winners, claimsCreated: payload.claimsCreated });
      setFinalizedAt(new Date().toISOString());
      log({ actor: "Admin", action: "Activity Finalized", description: `"${activity.title}": ${payload.winners.length} winner(s), ${payload.claimsCreated} new claim(s).` });
      toast(t("act.finalize.done", { n: payload.claimsCreated }));
    } catch (finalizeError) {
      toast(finalizeError instanceof Error ? finalizeError.message : "Unable to finalize winners");
    } finally {
      setFinalizing(false);
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
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {activity.mode !== "registered" && (
              <span className="badge pending" title={t("act.mode.legacyHint")}>{t("act.mode.legacy")}</span>
            )}
            {finalizedAt && (
              <span className="badge active" title={finalizedAt.slice(0, 16).replace("T", " ")}>{t("act.finalized")}</span>
            )}
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

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <button
          type="button"
          className="panel-section-title"
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}
          onClick={() => setPrizesOpen((v) => !v)}
          aria-expanded={prizesOpen}
        >
          <Icon name={prizesOpen ? "expand_more" : "chevron_right"} style={{ fontSize: 18 }} />
          {t("act.prizes.title")} ({prizes?.length ?? 0})
        </button>
        {prizesOpen && (
          <div style={{ marginTop: 12 }}>
            {prizeDrafts.map((draft, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span className="mono" style={{ fontSize: 12.5 }}>#</span>
                <input className="input mono" style={{ width: 64 }} value={draft.rankFrom} onChange={(e) => setPrizeDrafts((cur) => cur.map((d, j) => (j === i ? { ...d, rankFrom: e.target.value.replace(/\D/g, "") } : d)))} placeholder="1" aria-label="Rank from" />
                <span style={{ fontSize: 12.5 }}>–</span>
                <input className="input mono" style={{ width: 64 }} value={draft.rankTo} onChange={(e) => setPrizeDrafts((cur) => cur.map((d, j) => (j === i ? { ...d, rankTo: e.target.value.replace(/\D/g, "") } : d)))} placeholder="1" aria-label="Rank to" />
                <input className="input" style={{ flex: "2 1 160px" }} value={draft.title} onChange={(e) => setPrizeDrafts((cur) => cur.map((d, j) => (j === i ? { ...d, title: e.target.value } : d)))} placeholder={t("act.prizes.titlePh")} />
                <input className="input mono" style={{ flex: "1 1 100px" }} value={draft.valueNote} onChange={(e) => setPrizeDrafts((cur) => cur.map((d, j) => (j === i ? { ...d, valueNote: e.target.value } : d)))} placeholder="$500" />
                <button type="button" className="kebab" aria-label={t("common.delete")} onClick={() => setPrizeDrafts((cur) => cur.filter((_, j) => j !== i))}>
                  <Icon name="delete" />
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              <button type="button" className="btn btn-ghost" style={{ padding: "6px 12px" }} onClick={() => setPrizeDrafts((cur) => [...cur, { rankFrom: "", rankTo: "", title: "", valueNote: "" }])}>
                <Icon name="add" />
                {t("act.prizes.add")}
              </button>
              <button type="button" className="btn btn-ghost" style={{ padding: "6px 12px" }} onClick={() => setPrizeDrafts(defaultPrizeRows())}>
                {t("act.prizes.defaults")}
              </button>
              <button type="button" className="btn btn-primary" style={{ padding: "6px 12px" }} disabled={savingPrizes} onClick={() => void savePrizes()}>
                {t("common.save")}
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: "6px 12px" }}
                disabled={finalizing || activity.status !== "finished"}
                title={activity.status !== "finished" ? t("act.finalize.onlyFinished") : undefined}
                onClick={() => void finalize()}
              >
                <Icon name="emoji_events" />
                {finalizing ? "…" : t("act.finalize.cta")}
              </button>
              {finalizeResult && (
                <span style={{ fontSize: 12.5, color: "var(--text-sub)" }}>
                  {t("act.finalize.result", { winners: finalizeResult.winners.length, claims: finalizeResult.claimsCreated })}
                </span>
              )}
            </div>
            {!!finalizeResult?.winners.length && (
              <div className="table-wrap" style={{ marginTop: 8 }}>
                <table className="data">
                  <tbody>
                    {finalizeResult.winners.map((w) => (
                      <tr key={`${w.rank}-${w.memberName}`}>
                        <td className="mono">#{w.rank}</td>
                        <td>{w.memberName}</td>
                        <td className="mono">{w.lots.toFixed(2)}</td>
                        <td>{w.prizeTitle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
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
