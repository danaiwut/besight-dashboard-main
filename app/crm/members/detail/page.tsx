"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCrm,
  accessLabel,
  accessBadgeClass,
  accessLabelKey,
  telegramStatusLabelKey,
  primaryIndicatorAccess,
  memberLots,
  memberLotRange,
  requiredLotsFor,
  customerStage,
  customerStageBadgeClass,
  progressTone,
  initials,
  fmtDate,
  fmtDateTime,
  lot,
  PLAN_LABELS,
  type IndicatorAccess,
  type Member,
} from "../../../../components/crm/CrmContext";
import { useLanguage } from "../../../../components/crm/LanguageContext";
import { MemberDetailSkeleton } from "../../../../components/crm/Skeletons";
import { apiCall } from "../../../../lib/crmApi";
import Icon from "../../../../components/Icon";
import Drawer from "../../../../components/crm/Drawer";
import MemberForm from "../../../../components/crm/MemberForm";
import SuspendAccessModal from "../../../../components/crm/SuspendAccessModal";
import LotOverrideCard from "../../../../components/crm/LotOverrideCard";
import MemberIndicatorAccessPanel from "../../../../components/crm/MemberIndicatorAccessPanel";
import MemberTradeAccountsCard from "../../../../components/crm/MemberTradeAccountsCard";
import { MEMBER_LEVEL_LABEL_KEYS, PREMIUM_MONTHS, levelFromMonthlyLots, monthlyLotsFromLogs, recentMonthKeys } from "../../../../lib/memberLevel";
import type { LotPeriod } from "../../../../lib/lotCycle";

type RenewalRow = {
  id: number;
  indicator: string;
  period: string;
  qualifiedLots: number;
  requiredLots: number;
  renewed: boolean;
  origin?: string;
  note?: string;
  oldExpiry?: string;
  newExpiry?: string;
  createdDate: string;
};

/* Grant/renew audit for one member, read live from RenewalRecord (written by
   the lot-check automation and the renewal cron). Refetches whenever the
   realtime data version moves. Hidden while loading; hidden entirely when the
   member has no history yet. */
function MemberRenewalHistory({ memberId }: { memberId: number }) {
  const { t } = useLanguage();
  const { dataVersion, backendLive } = useCrm();
  const [rows, setRows] = useState<RenewalRow[] | null>(null);

  useEffect(() => {
    if (!backendLive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows([]);
      return;
    }
    let cancelled = false;
    // Reset to the loading state before refetching.
    setRows(null);
    fetch(`/api/crm/renewal-history/?memberId=${memberId}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; renewalHistory?: RenewalRow[] };
        if (!cancelled) setRows(response.ok && payload.ok && payload.renewalHistory ? payload.renewalHistory : []);
      })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [memberId, dataVersion, backendLive]);

  if (rows === null) {
    return (
      <div className="card" style={{ padding: 20, marginBottom: 16 }} aria-busy="true">
        <span className="skeleton" style={{ width: 170, height: 15, marginBottom: 16 }} />
        <span className="skeleton" style={{ height: 12, marginBottom: 10 }} />
        <span className="skeleton" style={{ width: "70%", height: 12 }} />
      </div>
    );
  }
  if (!rows.length) return null;

  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div className="panel-section-title">{t("members.section.renewalHistory")}</div>
      <div className="table-wrap">
        <table className="data" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <th>{t("members.col.period")}</th>
              <th>{t("members.col.indicator")}</th>
              <th>{t("members.col.qualifiedLots")}</th>
              <th>{t("members.col.result")}</th>
              <th>{t("members.col.origin")}</th>
              <th>{t("members.col.expiryChange")}</th>
              <th>{t("members.col.processedAt")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.period}</td>
                <td>{r.indicator}</td>
                <td>
                  <span className={`lots ${r.qualifiedLots >= r.requiredLots ? "met" : "risk"}`}>
                    {lot(r.qualifiedLots)}
                    <span className="req">/ {lot(r.requiredLots)}</span>
                  </span>
                </td>
                <td>
                  <span className={`badge ${r.renewed ? "active" : "expired"}`}>
                    {r.renewed ? t("members.renewal.renewed") : t("members.renewal.notRenewed")}
                  </span>
                </td>
                <td>
                  <span
                    className={`badge ${r.origin === "manual" ? "pending" : "suspended"}`}
                    title={r.note || undefined}
                  >
                    {t(r.origin === "manual" ? "members.origin.manual" : "members.origin.auto")}
                  </span>
                </td>
                <td className="mono">{r.oldExpiry ? `${fmtDate(r.oldExpiry)} → ${fmtDate(r.newExpiry)}` : "—"}</td>
                <td className="mono">{fmtDate(r.createdDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MemberDetailContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { members, setMembers, tradeAccounts, tradeLogs, indicatorAccess, setIndicatorAccess, telegramAccess, settings, toast, log, crmDataStatus, backendLive, lotSummaries, reloadFromDatabase } = useCrm();
  const { t } = useLanguage();
  const [editOpen, setEditOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lotsPeriod, setLotsPeriod] = useState<LotPeriod>("cycle");
  const [liveLots, setLiveLots] = useState<{ lots: number; required: number; checkedAt: string } | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const formRef = useRef<{ save: () => void }>(null);

  const id = Number(params.get("id"));
  const member = members.find((m) => m.id === id);
  // Snapshot-only header (current cycle, same number as the members list).
  // Other periods are read live from the server on demand.
  const summary = member ? lotSummaries[member.id] : undefined;
  const cycleLots = member
    ? (summary?.lots ?? memberLots(member, tradeAccounts, tradeLogs, settings, memberLotRange(member)))
    : 0;
  const lots = lotsPeriod === "cycle" ? cycleLots : (liveLots?.lots ?? cycleLots);

  useEffect(() => {
    if (lotsPeriod === "cycle" || !member || !backendLive) return;
    let cancelled = false;
    // Reset to the loading state before refetching.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiveLoading(true);
    setLiveLots(null);
    fetch(`/api/crm/members/${member.id}/lots/?period=${lotsPeriod}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; lots?: number; requiredLots?: number; checkedAt?: string };
        if (!cancelled && response.ok && payload.ok) {
          setLiveLots({ lots: payload.lots ?? 0, required: payload.requiredLots ?? 0, checkedAt: payload.checkedAt ?? "" });
        }
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLiveLoading(false); });
    return () => { cancelled = true; };
  }, [lotsPeriod, member?.id, backendLive]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshLots() {
    if (!member || refreshing) return;
    setRefreshing(true);
    try {
      const payload = await apiCall<{ member: Member }>(`/api/crm/members/${member.id}/lots/refresh/`, "POST", { period: lotsPeriod });
      setMembers((cur) => cur.map((m) => (m.id === member.id ? payload.member : m)));
      // Pull the fresh snapshot summary so header and list converge.
      await reloadFromDatabase();
      if (lotsPeriod !== "cycle") setLotsPeriod("cycle");
      toast(t("members.detail.lotsRefreshed"));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to refresh lots");
    } finally {
      setRefreshing(false);
    }
  }

  // Show a skeleton until the initial backend load settles — this also avoids
  // a false "member not found" flash while mock members are being replaced.
  if (crmDataStatus === "loading") return <MemberDetailSkeleton />;

  if (!member) {
    return (
      <section className="panel is-active">
        <div className="card" style={{ padding: 24 }}>
          <p className="modal-detail" style={{ textAlign: "left", margin: "0 0 16px" }}>
            {t("members.detail.notFound")}
          </p>
          <Link href="/crm/members/" className="btn btn-ghost">
            <Icon name="arrow_back" />
            {t("members.detail.back")}
          </Link>
        </div>
      </section>
    );
  }

  const access = primaryIndicatorAccess(member.id, indicatorAccess);
  const label = accessLabel(access, settings);
  const telegram = telegramAccess.find((tg) => tg.memberId === member.id);
  const stage = customerStage(member, indicatorAccess);
  const required = summary?.required ?? requiredLotsFor(member, settings);
  const levelMonths = recentMonthKeys(PREMIUM_MONTHS);
  const memberLevel = levelFromMonthlyLots(
    monthlyLotsFromLogs(tradeLogs.filter((log) => log.memberId === member.id), levelMonths),
    required,
    levelMonths,
  );
  const tone = progressTone(lots, required);
  const pct = Math.min(100, required > 0 ? (lots / required) * 100 : 100);
  const snapshotStale = lotsPeriod === "cycle" && (summary?.stale ?? true);
  const asOfText = lotsPeriod !== "cycle"
    ? liveLoading
      ? t("members.detail.refreshing")
      : liveLots
        ? t("members.detail.lotsAsOf", { when: fmtDateTime(liveLots.checkedAt) })
        : t("members.detail.lotsLedger")
    : summary?.asOf && !summary.stale
      ? t("members.detail.lotsAsOf", { when: fmtDateTime(summary.asOf) })
      : t("members.detail.lotsLedger");

  async function handleSuspend(reasons: string[], note: string) {
    const id = member!.id;
    if (backendLive) {
      try {
        const mine = indicatorAccess.filter((a) => a.memberId === id);
        const saved = await Promise.all(
          mine.map((a) => apiCall<{ indicatorAccess: IndicatorAccess }>(`/api/crm/indicator-access/${a.id}/`, "PATCH", { status: "suspended" }))
        );
        const byId = new Map(saved.map((s) => [s.indicatorAccess.id, s.indicatorAccess]));
        setIndicatorAccess((cur) => cur.map((a) => byId.get(a.id) ?? a));
      } catch (error) {
        toast(error instanceof Error ? error.message : "Unable to suspend access");
        return;
      }
    } else {
      setIndicatorAccess((cur) => cur.map((a) => (a.memberId === id ? { ...a, status: "suspended" } : a)));
    }
    log({
      actor: "Alex Dean",
      memberId: id,
      memberName: member!.name,
      action: "Manual Admin Override",
      description: `Indicator access suspended.${reasons.length ? ` Reason: ${reasons.join(", ")}.` : ""}${note ? ` "${note}"` : ""}`,
    });
    toast(t("members.toast.suspended", { name: member!.name }));
    setSuspendOpen(false);
  }

  async function handleDelete() {
    const id = member!.id;
    const name = member!.name;
    if (backendLive) {
      try {
        await apiCall(`/api/crm/members/${id}/`, "DELETE");
      } catch (error) {
        toast(error instanceof Error ? error.message : "Unable to delete member");
        return;
      }
    }
    setMembers((cur) => cur.filter((x) => x.id !== id));
    toast(t("members.toast.deleted", { name }));
    router.push("/crm/members/");
  }

  return (
    <section className="panel is-active">
      <Link href="/crm/members/" className="btn btn-ghost" style={{ marginBottom: 16 }}>
        <Icon name="arrow_back" />
        {t("members.detail.back")}
      </Link>

      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div className="drawer-profile" style={{ marginBottom: 0 }}>
            <span className="avatar">{initials(member.name)}</span>
            <div>
              <div className="dn">
                {member.name}{" "}
                <span className={`badge ${customerStageBadgeClass(stage)}`} style={{ marginLeft: 4 }}>
                  {t(`members.stage.${stage}`)}
                </span>
              </div>
              <div className="de">{member.email}</div>
              <span className={`plan-pill ${member.plan === "ib_partner" ? "elite" : "free"}`} style={{ marginTop: 8, display: "inline-flex" }}>
                {PLAN_LABELS[member.plan]}
              </span>
              <span className={`badge ${memberLevel === "premium" ? "active" : memberLevel === "standard" ? "pending" : "suspended"}`} style={{ marginLeft: 8 }}>
                {t(MEMBER_LEVEL_LABEL_KEYS[memberLevel])}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" onClick={() => setEditOpen(true)}>
              <Icon name="edit" />
              {t("common.edit")}
            </button>
            {access?.status !== "suspended" && (
              <button className="btn btn-danger" onClick={() => setSuspendOpen(true)}>
                {t("members.suspendAccess")}
              </button>
            )}
            <button className="btn btn-danger" aria-label="Delete" onClick={handleDelete}>
              <Icon name="delete" />
            </button>
          </div>
        </div>
      </div>

      <div className="form-grid2" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="panel-section-title">{t("members.section.personal")}</div>
          <div className="drawer-row">
            <span className="k">{t("members.field.memberId")}</span>
            <span className="v mono">{member.code}</span>
          </div>
          <div className="drawer-row">
            <span className="k">{t("members.field.phone")}</span>
            <span className="v">{member.phone || "—"}</span>
          </div>
          <div className="drawer-row">
            <span className="k">{t("members.field.country")}</span>
            <span className="v">{member.country || "—"}</span>
          </div>
          <div className="drawer-row">
            <span className="k">{t("members.field.created")}</span>
            <span className="v">{fmtDate(member.createdDate)}</span>
          </div>
          <div className="drawer-row" style={{ borderBottom: "none" }}>
            <span className="k">{t("members.section.tradingview")}</span>
            <span className="v mono">{member.tv || "—"}</span>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="panel-section-title">{t("members.section.telegram")}</div>
          <div className="drawer-row">
            <span className="k">{t("members.field.username")}</span>
            <span className="v mono">{member.telegramUsername || "—"}</span>
          </div>
          <div className="drawer-row">
            <span className="k">{t("members.field.userId")}</span>
            <span className="v mono">{member.telegramUserId || "—"}</span>
          </div>
          <div className="drawer-row" style={{ borderBottom: "none" }}>
            <span className="k">{t("members.col.accessStatus")}</span>
            <span className="v">{telegram ? <span className={`badge ${telegram.status}`}>{t(telegramStatusLabelKey(telegram.status))}</span> : "—"}</span>
          </div>
        </div>
      </div>

      <div className="form-grid2" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="panel-section-title">{t("lm.col.progress")}</div>
          <div className={`lot-progress ${tone}`}>
            <div className="lp-track">
              <span className="lp-fill" style={{ width: `${pct}%` }}></span>
            </div>
            <span className="lp-label">
              {t("lm.lotsLabel", { lots: lot(lots), required: lot(required) })}
            </span>
          </div>
          <div style={{ marginTop: 4 }}>
            <span className={`badge ${accessBadgeClass(label)}`}>{t(accessLabelKey(label))}</span>
            {snapshotStale && (
              <span className="badge pending" style={{ marginLeft: 6 }}>
                <Icon name="schedule" style={{ fontSize: 12 }} />
                {t("members.lotsStaleBadge")}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--text-sub)" }}>{asOfText}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <select
                className="filter-select"
                aria-label={t("members.lotsPeriod.label")}
                value={lotsPeriod}
                onChange={(event) => setLotsPeriod(event.target.value as LotPeriod)}
              >
                <option value="cycle">{t("members.lotsPeriod.cycle")}</option>
                <option value="entitlement">{t("members.lotsPeriod.entitlement")}</option>
                <option value="month">{t("members.lotsPeriod.month")}</option>
              </select>
              <button className="btn btn-ghost" style={{ padding: "6px 12px" }} onClick={() => void refreshLots()} disabled={refreshing || !backendLive}>
                <Icon name="sync" />
                {refreshing ? t("members.detail.refreshing") : t("members.detail.refreshLots")}
              </button>
            </span>
          </div>
          <div style={{ marginTop: 16 }}>
            <LotOverrideCard member={member} />
          </div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <MemberIndicatorAccessPanel member={member} />
        </div>
      </div>

      <MemberRenewalHistory memberId={member.id} />

      <MemberTradeAccountsCard key={`${member.id}:${member.crmStartDate || ""}:${member.crmExpiryDate || ""}`} member={member} />

      <Drawer
        open={editOpen}
        title={t("members.drawer.edit")}
        onClose={() => setEditOpen(false)}
        body={<MemberForm ref={formRef} member={member} onDone={() => setEditOpen(false)} />}
        foot={
          <>
            <button className="btn btn-ghost" onClick={() => setEditOpen(false)}>
              {t("common.cancel")}
            </button>
            <button className="btn btn-primary" onClick={() => formRef.current?.save()}>
              {t("common.saveChanges")}
            </button>
          </>
        }
      />

      {suspendOpen && <SuspendAccessModal member={member} onConfirm={handleSuspend} onClose={() => setSuspendOpen(false)} />}
    </section>
  );
}

export default function MemberDetailPage() {
  return (
    <Suspense fallback={null}>
      <MemberDetailContent />
    </Suspense>
  );
}
