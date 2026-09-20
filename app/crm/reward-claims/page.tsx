"use client";

import { useCallback, useEffect, useState } from "react";
import { useCrm } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { TableSkeleton } from "../../../components/crm/Skeletons";
import Drawer from "../../../components/crm/Drawer";
import { apiCall } from "../../../lib/crmApi";
import type { RewardClaimDto, RewardClaimKind, RewardClaimStatus } from "../../../lib/activities";
import Icon from "../../../components/Icon";

const STATUS_BADGE: Record<RewardClaimStatus, string> = { pending: "pending", fulfilled: "active", cancelled: "suspended" };

/** The single fulfilment queue: tier claims, competition prizes and manual
 *  grants all land here — fulfil or cancel with a note, in one place. */
export default function CrmRewardClaimsPage() {
  const { t } = useLanguage();
  const { toast, log, dataVersion, crmDataStatus } = useCrm();
  const [claims, setClaims] = useState<RewardClaimDto[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RewardClaimStatus>("pending");
  const [kindFilter, setKindFilter] = useState<"all" | RewardClaimKind>("all");
  const [query, setQuery] = useState("");
  const [noteFor, setNoteFor] = useState<RewardClaimDto | null>(null);
  const [note, setNote] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMemberId, setManualMemberId] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualDetail, setManualDetail] = useState("");
  const [workingId, setWorkingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (kindFilter !== "all") params.set("kind", kindFilter);
      if (query.trim()) params.set("q", query.trim());
      const payload = await apiCall<{ claims: RewardClaimDto[]; summary: Record<string, number> }>(
        `/api/crm/reward-claims/?${params}`,
        "GET",
      );
      setClaims(payload.claims);
      setSummary(payload.summary);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load claims");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, kindFilter]);

  useEffect(() => {
    if (crmDataStatus === "loading") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [crmDataStatus, dataVersion, load]);

  async function decide(claim: RewardClaimDto, status: RewardClaimStatus) {
    setWorkingId(claim.id);
    try {
      const payload = await apiCall<{ claim: RewardClaimDto }>(`/api/crm/reward-claims/${claim.id}/`, "PATCH", { status });
      setClaims((cur) => cur.map((c) => (c.id === claim.id ? payload.claim : c)));
      log({
        actor: "Admin", memberId: claim.memberId, memberName: claim.memberName,
        action: status === "fulfilled" ? "Reward Fulfilled" : "Reward Cancelled",
        description: `"${claim.title}" → ${status}.`,
      });
      toast(t(status === "fulfilled" ? "rw.claims.fulfilled" : "rw.claims.cancelled"));
    } catch (decideError) {
      toast(decideError instanceof Error ? decideError.message : "Unable to update claim");
    } finally {
      setWorkingId(null);
    }
  }

  async function saveNote() {
    if (!noteFor) return;
    setWorkingId(noteFor.id);
    try {
      const payload = await apiCall<{ claim: RewardClaimDto }>(`/api/crm/reward-claims/${noteFor.id}/`, "PATCH", { note });
      setClaims((cur) => cur.map((c) => (c.id === noteFor.id ? payload.claim : c)));
      setNoteFor(null);
      toast(t("common.saved"));
    } catch (noteError) {
      toast(noteError instanceof Error ? noteError.message : "Unable to save note");
    } finally {
      setWorkingId(null);
    }
  }

  async function createManual() {
    const memberId = Number(manualMemberId);
    if (!Number.isInteger(memberId) || memberId <= 0 || !manualTitle.trim()) {
      toast(t("rw.claims.manualRequired"));
      return;
    }
    setWorkingId(-1);
    try {
      const payload = await apiCall<{ claim: RewardClaimDto }>("/api/crm/reward-claims/", "POST", {
        memberId, title: manualTitle.trim(), detail: manualDetail.trim(),
      });
      setClaims((cur) => [payload.claim, ...cur]);
      setManualOpen(false);
      setManualMemberId("");
      setManualTitle("");
      setManualDetail("");
      toast(t("rw.claims.manualCreated"));
    } catch (createError) {
      toast(createError instanceof Error ? createError.message : "Unable to create claim");
    } finally {
      setWorkingId(null);
    }
  }

  if (crmDataStatus === "loading" || loading) {
    return (
      <section className="panel is-active">
        <TableSkeleton cols={6} rows={5} minWidth={1000} />
      </section>
    );
  }

  return (
    <section className="panel is-active">
      <div className="stat-grid cols-3" style={{ marginBottom: 16 }}>
        {(["pending", "fulfilled", "cancelled"] as const).map((key) => (
          <div className="stat-card" key={key}>
            <div className="value">{summary[key] ?? 0}</div>
            <div className="label">{t(`rw.claims.status.${key}`)}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="toolbar">
          <select className="filter-select" aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | RewardClaimStatus)}>
            <option value="all">{t("common.all")}</option>
            <option value="pending">{t("rw.claims.status.pending")}</option>
            <option value="fulfilled">{t("rw.claims.status.fulfilled")}</option>
            <option value="cancelled">{t("rw.claims.status.cancelled")}</option>
          </select>
          <select className="filter-select" aria-label="Kind" value={kindFilter} onChange={(e) => setKindFilter(e.target.value as "all" | RewardClaimKind)}>
            <option value="all">{t("rw.claims.allKinds")}</option>
            <option value="tier">{t("rw.claims.kind.tier")}</option>
            <option value="competition">{t("rw.claims.kind.competition")}</option>
            <option value="manual">{t("rw.claims.kind.manual")}</option>
          </select>
          <div className="search">
            <Icon name="search" />
            <input
              type="search"
              placeholder={t("rw.claims.search")}
              aria-label="Search claims"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void load(); }}
            />
          </div>
          <div className="toolbar-actions">
            <button className="btn btn-primary" onClick={() => setManualOpen(true)}>
              <Icon name="add" />
              {t("rw.claims.manualAdd")}
            </button>
          </div>
        </div>

        {error && <div style={{ padding: "0 20px 12px", color: "var(--red)", fontSize: 13 }}>{error}</div>}

        <div className="table-wrap">
          <table className="data" style={{ minWidth: 1050 }}>
            <thead>
              <tr>
                <th>{t("rw.claims.col.member")}</th>
                <th>{t("rw.claims.col.reward")}</th>
                <th>{t("rw.claims.col.kind")}</th>
                <th>{t("rw.claims.col.status")}</th>
                <th>{t("rw.claims.col.created")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {claims.length ? (
                claims.map((claim) => (
                  <tr key={claim.id}>
                    <td>
                      <div className="cn">{claim.memberName}</div>
                      <div className="ce mono">{claim.memberCode}</div>
                    </td>
                    <td>
                      <div className="cn">{claim.title}</div>
                      {claim.detail && <div className="ce">{claim.detail}</div>}
                      {claim.note && <div className="ce">📝 {claim.note}</div>}
                    </td>
                    <td>
                      <span className="badge suspended">{t(`rw.claims.kind.${claim.kind}`)}</span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[claim.status]}`}>{t(`rw.claims.status.${claim.status}`)}</span>
                    </td>
                    <td className="mono">{claim.createdAt.slice(0, 10)}</td>
                    <td className="row-actions">
                      {claim.status === "pending" && (
                        <>
                          <button className="kebab" aria-label={t("rw.claims.fulfill")} title={t("rw.claims.fulfill")} disabled={workingId === claim.id} onClick={() => void decide(claim, "fulfilled")}>
                            <Icon name="check_circle" />
                          </button>
                          <button className="kebab" aria-label={t("rw.claims.cancel")} title={t("rw.claims.cancel")} disabled={workingId === claim.id} onClick={() => void decide(claim, "cancelled")}>
                            <Icon name="cancel" />
                          </button>
                        </>
                      )}
                      <button
                        className="kebab"
                        aria-label={t("rw.claims.note")}
                        title={t("rw.claims.note")}
                        onClick={() => { setNoteFor(claim); setNote(claim.note ?? ""); }}
                      >
                        <Icon name="edit_note" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="table-empty">{t("rw.claims.empty")}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer
        open={noteFor !== null}
        title={t("rw.claims.note")}
        onClose={() => setNoteFor(null)}
        body={
          <div className="field">
            <label>{t("rw.claims.note")}</label>
            <textarea className="input" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        }
        foot={
          <>
            <button className="btn btn-ghost" onClick={() => setNoteFor(null)}>
              {t("common.cancel")}
            </button>
            <button className="btn btn-primary" disabled={workingId !== null} onClick={() => void saveNote()}>
              {t("common.save")}
            </button>
          </>
        }
      />

      <Drawer
        open={manualOpen}
        title={t("rw.claims.manualAdd")}
        onClose={() => setManualOpen(false)}
        body={
          <>
            <div className="field">
              <label>{t("rw.claims.field.memberId")}</label>
              <input className="input mono" value={manualMemberId} onChange={(e) => setManualMemberId(e.target.value.replace(/\D/g, ""))} placeholder="123" />
            </div>
            <div className="field">
              <label>{t("rw.claims.field.title")}</label>
              <input className="input" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>{t("rw.claims.field.detail")}</label>
              <input className="input" value={manualDetail} onChange={(e) => setManualDetail(e.target.value)} />
            </div>
          </>
        }
        foot={
          <>
            <button className="btn btn-ghost" onClick={() => setManualOpen(false)}>
              {t("common.cancel")}
            </button>
            <button className="btn btn-primary" disabled={workingId !== null} onClick={() => void createManual()}>
              {t("rw.claims.manualAdd")}
            </button>
          </>
        }
      />
    </section>
  );
}
