"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useCrm,
  accessLabel,
  accessBadgeClass,
  accessLabelKey,
  verificationLabelKey,
  primaryIndicatorAccess,
  memberIndicatorAccess,
  memberLots,
  memberLotRange,
  accountLots,
  requiredLotsFor,
  memberTradeAccounts,
  verificationBadgeClass,
  customerStage,
  customerStageBadgeClass,
  qualification,
  type CustomerStage,
  initials,
  fmtDate,
  lot,
  PLAN_LABELS,
  ACQUISITION_CHANNEL_LABELS,
  type Member,
} from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { MembersSkeleton } from "../../../components/crm/Skeletons";
import Icon from "../../../components/Icon";
import Drawer from "../../../components/crm/Drawer";
import MemberForm from "../../../components/crm/MemberForm";
import MemberIndicatorAccessPanel from "../../../components/crm/MemberIndicatorAccessPanel";
import DateRangePicker from "../../../components/crm/DateRangePicker";
import Pagination from "../../../components/crm/Pagination";
import { apiCall } from "../../../lib/crmApi";
import { exportCsv } from "../../../lib/exportCsv";
import { MEMBER_LEVEL_LABEL_KEYS, PREMIUM_MONTHS, levelFromMonthlyLots, recentMonthKeys, type MemberLevel } from "../../../lib/memberLevel";

type DrawerMode = { kind: "form"; member: Member | null } | { kind: "access"; member: Member } | null;
type LotsFilter = "all" | "qualified" | "not_qualified";
const STATUS_FILTERS = ["Active", "Expiring Soon", "Expired", "Suspended", "Pending"];

const FILTERS_STORAGE_KEY = "crm.members.filters";
type SavedFilters = {
  status: string;
  broker: string;
  plan: string;
  stage: "all" | CustomerStage;
  lots: LotsFilter;
  dateRange: { from: string; to: string };
  query: string;
  page: number;
  sortKey: "lots" | "startDate" | "expiryDate" | null;
  sortDir: "asc" | "desc";
};

function readSavedFilters(): SavedFilters | null {
  try {
    const raw = sessionStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedFilters>;
    return {
      status: typeof v.status === "string" ? v.status : "all",
      broker: typeof v.broker === "string" ? v.broker : "all",
      plan: typeof v.plan === "string" ? v.plan : "all",
      stage: v.stage === "new" || v.stage === "existing" ? v.stage : "all",
      lots: v.lots === "qualified" || v.lots === "not_qualified" ? v.lots : "all",
      dateRange: { from: typeof v.dateRange?.from === "string" ? v.dateRange.from : "", to: typeof v.dateRange?.to === "string" ? v.dateRange.to : "" },
      query: typeof v.query === "string" ? v.query : "",
      page: Number.isInteger(v.page) && Number(v.page) > 0 ? Number(v.page) : 1,
      sortKey: v.sortKey === "lots" || v.sortKey === "startDate" || v.sortKey === "expiryDate" ? v.sortKey : null,
      sortDir: v.sortDir === "desc" ? "desc" : "asc",
    };
  } catch {
    return null;
  }
}
const PAGE_SIZE = 50;

export default function MembersPage() {
  const { members, tradeAccounts, tradeLogs, indicatorAccess, setIndicatorAccess, brokers, settings, toast, memberSyncStatus, memberSyncError, refreshMembers, crmDataStatus, reloadFromDatabase, lotSummaries, lotOverview, backendLive } = useCrm();
  const { t } = useLanguage();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("all");
  const [brokerFilter, setBrokerFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState<"all" | CustomerStage>("all");
  const [lotsFilter, setLotsFilter] = useState<LotsFilter>("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [lookupBroker, setLookupBroker] = useState(() => String(brokers.find((b) => b.name === "XM")?.id ?? "all"));
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResult, setLookupResult] = useState<"idle" | "not_found" | number>("idle");
  const [webhookPreview, setWebhookPreview] = useState<null | { loading: boolean; lots?: number; message?: string; verification?: string; error?: string }>(null);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<"lots" | "startDate" | "expiryDate" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [lotRefreshBusy, setLotRefreshBusy] = useState(false);
  const staleLotsChecked = useRef(false);
  const formRef = useRef<{ save: () => void }>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filtersOpen) return;
    function onDocClick(e: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setFiltersOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFiltersOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);

  /** Recomputes lot snapshots for members whose entitlement window moved since
   *  they were stamped, so the list shows the current period's real lots. */
  const refreshStaleLots = useCallback(async (silent = false) => {
    setLotRefreshBusy(true);
    try {
      const payload = await apiCall<{ refreshed: number; stale: number; remaining: number }>("/api/crm/members/lots/refresh-stale/", "POST");
      if (payload.refreshed > 0) {
        await reloadFromDatabase();
        if (!silent) toast(t("members.lotsRefreshed", { n: payload.refreshed }));
      } else if (!silent) {
        toast(t("members.lotsUpToDate"));
      }
    } catch (error) {
      if (!silent) toast(error instanceof Error ? error.message : "Unable to refresh lots");
    } finally {
      setLotRefreshBusy(false);
    }
  }, [reloadFromDatabase, t, toast]);

  useEffect(() => {
    if (crmDataStatus !== "ready" || staleLotsChecked.current) return;
    staleLotsChecked.current = true;
    void refreshStaleLots(true);
  }, [crmDataStatus, refreshStaleLots]);

  const snapshotStale = (m: Member) => lotSummaries[m.id]?.stale ?? Boolean(m.crmStartDate && m.crmExpiryDate && (m.currentPeriodLotsFrom !== m.crmStartDate || m.currentPeriodLotsTo !== m.crmExpiryDate));

  /** Snapshot-only lots from the server (current cycle, no webhooks). Falls
   *  back to local ledger math in demo mode when summaries are absent. */
  const summaryLots = (m: Member): number =>
    lotSummaries[m.id]?.lots ?? memberLots(m, tradeAccounts, tradeLogs, settings, memberLotRange(m));
  const summaryRequired = (m: Member): number =>
    lotSummaries[m.id]?.required ?? requiredLotsFor(m, settings);

  const accessOf = (memberId: number) => primaryIndicatorAccess(memberId, indicatorAccess);
  /** Same verdict the server counted for the Overview/qualified cards, so a
   *  filtered list always matches the number that was clicked. */
  const isQualified = (m: Member): boolean =>
    lotSummaries[m.id]?.qualified ?? qualification(summaryLots(m), summaryRequired(m)) === "qualified";

  /* Filters survive opening a member and coming back: they are saved for the
     browser session and restored on mount. Overview stat cards deep-link with
     ?status= / ?lots=, which start from a clean slate instead. Read in an effect
     (not useSearchParams) to avoid a Suspense boundary around the page. */
  const skipFirstSave = useRef(true);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const lots = params.get("lots");
    /* eslint-disable react-hooks/set-state-in-effect -- one-time restore on mount */
    if (status || lots) {
      if (status && STATUS_FILTERS.includes(status)) setStatusFilter(status);
      if (lots === "qualified" || lots === "not_qualified") setLotsFilter(lots);
    } else {
      const saved = readSavedFilters();
      if (saved) {
        if (saved.status === "all" || STATUS_FILTERS.includes(saved.status)) setStatusFilter(saved.status);
        setBrokerFilter(saved.broker);
        setPlanFilter(saved.plan);
        setStageFilter(saved.stage);
        setLotsFilter(saved.lots);
        setDateRange(saved.dateRange);
        setQuery(saved.query);
        setPage(saved.page);
        setSortKey(saved.sortKey);
        setSortDir(saved.sortDir);
      }
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    // Skip the mount run: state still holds the defaults at that point, and
    // saving them would clobber what the restore effect above is applying.
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    try {
      const value: SavedFilters = {
        status: statusFilter, broker: brokerFilter, plan: planFilter, stage: stageFilter, lots: lotsFilter,
        dateRange, query, page, sortKey, sortDir,
      };
      sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(value));
    } catch {
      // storage blocked (private mode) — filters just won't persist
    }
  }, [statusFilter, brokerFilter, planFilter, stageFilter, lotsFilter, dateRange, query, page, sortKey, sortDir]);

  function applyLotsFilter(next: LotsFilter) {
    setLotsFilter(next);
    setPage(1);
  }

  /** Member level (basic/standard/premium) from the CRM's monthly lot totals —
   *  same rule the course level gate uses, computed once for the whole page. */
  const memberLevels = useMemo(() => {
    const months = recentMonthKeys(PREMIUM_MONTHS);
    const byMember = new Map<number, Record<string, number>>();
    for (const log of tradeLogs) {
      const key = log.tradeDate.slice(0, 7);
      if (!months.includes(key)) continue;
      let monthly = byMember.get(log.memberId);
      if (!monthly) {
        monthly = {};
        byMember.set(log.memberId, monthly);
      }
      monthly[key] = (monthly[key] ?? 0) + log.lots;
    }
    const map = new Map<number, MemberLevel>();
    for (const member of members) {
      map.set(member.id, levelFromMonthlyLots(byMember.get(member.id) ?? {}, requiredLotsFor(member, settings), months));
    }
    return map;
  }, [members, tradeLogs, settings]);

  function lookupTradeId() {
    const q = lookupQuery.trim().toLowerCase();
    if (!q) return;
    const found = tradeAccounts.find((a) => a.tradeId.toLowerCase() === q && (lookupBroker === "all" || a.brokerId === Number(lookupBroker)));
    setLookupResult(found ? found.id : "not_found");
    setWebhookPreview(null);
  }

  /** Live webhook preview for a Trade ID with no local row — answers "has this
   *  ID ever traded?" without persisting anything. */
  async function checkWebhook() {
    const q = lookupQuery.trim();
    if (!q || webhookPreview?.loading) return;
    setWebhookPreview({ loading: true });
    try {
      const response = await fetch("/api/crm/trade-accounts/verify/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId: q }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; verification?: string; totalLots?: number; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "ตรวจ webhook ไม่สำเร็จ");
      setWebhookPreview({ loading: false, lots: payload.totalLots ?? 0, message: payload.message, verification: payload.verification });
    } catch (error) {
      setWebhookPreview({ loading: false, error: error instanceof Error ? error.message : "ตรวจ webhook ไม่สำเร็จ" });
    }
  }

  const lookupAccount = typeof lookupResult === "number" ? tradeAccounts.find((a) => a.id === lookupResult) ?? null : null;
  const lookupMember = lookupAccount ? members.find((m) => m.id === lookupAccount.memberId) ?? null : null;

  function toggleSort(key: "lots" | "startDate" | "expiryDate") {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  function sortIcon(key: "lots" | "startDate" | "expiryDate") {
    if (sortKey !== key) return "unfold_more";
    return sortDir === "asc" ? "arrow_upward" : "arrow_downward";
  }

  function openDetail(memberId: number) {
    router.push(`/crm/members/detail/?id=${memberId}`);
  }

  const qualificationCounts = useMemo(() => {
    // Server-computed overview (snapshot-only, current cycle) — no per-row
    // ledger scan on every render. Falls back to local math in demo mode.
    if (lotOverview) return { qualified: lotOverview.qualified, notQualified: lotOverview.notQualified };
    let qualified = 0;
    for (const m of members) {
      if (qualification(summaryLots(m), summaryRequired(m)) === "qualified") qualified++;
    }
    return { qualified, notQualified: members.length - qualified };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, lotOverview, lotSummaries, tradeAccounts, tradeLogs, settings]);

  const list = useMemo(() => {
    const q = query.toLowerCase();
    const filtered = members
      .filter((m) => statusFilter === "all" || accessLabel(accessOf(m.id), settings) === statusFilter)
      .filter((m) => {
        if (brokerFilter === "all") return true;
        return memberTradeAccounts(m.id, tradeAccounts).some((a) => a.brokerId === Number(brokerFilter));
      })
      .filter((m) => planFilter === "all" || m.plan === planFilter)
      .filter((m) => stageFilter === "all" || customerStage(m, indicatorAccess) === stageFilter)
      .filter((m) => lotsFilter === "all" || isQualified(m) === (lotsFilter === "qualified"))
      .filter((m) => !dateRange.from || m.joinedDate >= dateRange.from)
      .filter((m) => !dateRange.to || m.joinedDate <= dateRange.to)
      .filter((m) => {
        if (!q) return true;
        // Search every column the table shows — including each Trade ID, so
        // pasting an account number finds its member.
        const haystack = [
          m.name, m.email, m.tv, m.telegramUsername ?? "", m.code, m.phone ?? "", m.country ?? "",
          ...memberTradeAccounts(m.id, tradeAccounts).map((account) => account.tradeId),
        ].join(" ").toLowerCase();
        return haystack.includes(q);
      });

    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "lots") {
        return (summaryLots(a) - summaryLots(b)) * dir;
      }
      const av = (sortKey === "startDate" ? accessOf(a.id)?.startDate ?? a.crmStartDate : accessOf(a.id)?.expiryDate ?? a.crmExpiryDate) ?? "";
      const bv = (sortKey === "startDate" ? accessOf(b.id)?.startDate ?? b.crmStartDate : accessOf(b.id)?.expiryDate ?? b.crmExpiryDate) ?? "";
      return av.localeCompare(bv) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, statusFilter, brokerFilter, planFilter, stageFilter, lotsFilter, dateRange, query, tradeAccounts, tradeLogs, indicatorAccess, settings, lotSummaries, sortKey, sortDir]);

  const paged = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = {
    all: members.length,
    Active: members.filter((m) => accessLabel(accessOf(m.id), settings) === "Active").length,
    "Expiring Soon": members.filter((m) => accessLabel(accessOf(m.id), settings) === "Expiring Soon").length,
    Expired: members.filter((m) => accessLabel(accessOf(m.id), settings) === "Expired").length,
    Suspended: members.filter((m) => accessLabel(accessOf(m.id), settings) === "Suspended").length,
    Pending: members.filter((m) => accessLabel(accessOf(m.id), settings) === "Pending").length,
  };

  function toggleExpand(id: number) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function closeDrawer() {
    setDrawerMode(null);
  }

  /** Row "Renew": one indicator → confirm and extend right away (server adds
   *  renewalPeriodMonths from max(expiry, now) and logs the manual renewal);
   *  several (or none) → open the access panel to pick. */
  const [renewingId, setRenewingId] = useState<number | null>(null);
  async function renewFromRow(m: Member) {
    const renewable = memberIndicatorAccess(m.id, indicatorAccess).filter((a) => a.status !== "suspended");
    if (renewable.length !== 1) {
      setDrawerMode({ kind: "access", member: m });
      return;
    }
    const access = renewable[0];
    if (!window.confirm(t("members.renewConfirm", { name: m.name, indicator: access.indicator, months: settings.renewalPeriodMonths }))) return;
    setRenewingId(m.id);
    try {
      const payload = await apiCall<{ indicatorAccess: typeof access }>(`/api/crm/indicator-access/${access.id}/`, "PATCH", { extend: true });
      setIndicatorAccess((cur) => cur.map((a) => (a.id === access.id ? payload.indicatorAccess : a)));
      toast(t("ia.toast.extended", { name: m.name }));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to extend indicator access");
    } finally {
      setRenewingId(null);
    }
  }

  function goToPage(p: number) {
    setPage(p);
  }

  function exportMembers() {
    const headers = [
      "Member ID", "Name", "Email", "Phone", "Country", "Plan", "Broker", "Account Type", "Trade ID", "TradingView", "Telegram",
      "Indicator", "Current Lots", "Required Lots", "Access Status", "Start Date", "Expiry Date", "Joined Date", "Channel",
    ];
    const rows = list.flatMap((m) => {
      const accts = memberTradeAccounts(m.id, tradeAccounts);
      const access = accessOf(m.id);
      const base = [m.code, m.name, m.email, m.phone, m.country ?? "", PLAN_LABELS[m.plan]];
      const tail = [
        m.tv, m.telegramUsername ?? "",
        access?.indicator ?? "", summaryLots(m), summaryRequired(m),
        accessLabel(access, settings), fmtDate(access?.startDate ?? m.crmStartDate), fmtDate(access?.expiryDate ?? m.crmExpiryDate), fmtDate(m.joinedDate),
        m.channels?.map((c) => ACQUISITION_CHANNEL_LABELS[c]).join(" / ") ?? "",
      ];
      if (!accts.length) return [[...base, "", "", "", ...tail]];
      return accts.map((a) => [
        ...base,
        brokers.find((b) => b.id === a.brokerId)?.name ?? "",
        a.accountType || "",
        a.tradeId,
        ...tail,
      ]);
    });
    exportCsv("members-export", headers, rows);
    toast(t("members.toast.exported", { n: list.length }));
  }

  const title = drawerMode?.kind === "form"
    ? (drawerMode.member ? t("members.drawer.edit") : t("members.drawer.add"))
    : drawerMode?.kind === "access"
      ? t("members.drawer.access", { name: drawerMode.member.name })
      : "";

  if (crmDataStatus === "loading") return <MembersSkeleton />;

  return (
    <section className="panel is-active">
      <div className={`sync-banner ${memberSyncStatus}`}>
        <span className="sync-dot" />
        <div>
          <strong>{memberSyncStatus === "live" ? "ข้อมูลสมาชิกจาก CRM" : memberSyncStatus === "loading" ? "กำลังซิงก์ข้อมูลสมาชิก" : memberSyncStatus === "error" ? "ยังใช้ข้อมูลตัวอย่างอยู่" : "ข้อมูลสมาชิก"}</strong>
          <span>{memberSyncStatus === "live" ? `ซิงก์แล้ว ${members.length.toLocaleString()} คน` : memberSyncStatus === "error" ? memberSyncError : "กำลังเชื่อมต่อ CRM"}</span>
        </div>
        <button
          className="kebab"
          aria-label={t("members.refreshLotsBtn")}
          title={t("members.refreshLotsBtn")}
          onClick={() => void refreshStaleLots()}
          disabled={lotRefreshBusy}
        >
          <Icon name="speed" />
        </button>
        <button className="kebab" aria-label="ซิงก์ข้อมูลสมาชิกใหม่" title="ซิงก์ข้อมูลสมาชิกใหม่" onClick={() => void refreshMembers()} disabled={memberSyncStatus === "loading"}>
          <Icon name="sync" />
        </button>
      </div>
      <div className="stat-grid cols-3">
        <div className="stat-card">
          <div className="value">{(lotOverview?.requiredLots ?? settings.requiredLots).toFixed(2)}</div>
          <div className="label">{t("lm.requiredLotsCard")}</div>
        </div>
        <button
          type="button"
          className={`stat-card stat-card-link${lotsFilter === "qualified" ? " is-selected" : ""}`}
          aria-pressed={lotsFilter === "qualified"}
          onClick={() => applyLotsFilter(lotsFilter === "qualified" ? "all" : "qualified")}
        >
          <div className="value">{qualificationCounts.qualified}</div>
          <div className="label">{t("lm.qualifiedThisMonth")}</div>
        </button>
        <button
          type="button"
          className={`stat-card stat-card-link${lotsFilter === "not_qualified" ? " is-selected" : ""}`}
          aria-pressed={lotsFilter === "not_qualified"}
          onClick={() => applyLotsFilter(lotsFilter === "not_qualified" ? "all" : "not_qualified")}
        >
          <div className="value">{qualificationCounts.notQualified}</div>
          <div className="label">{t("lm.notYetQualified")}</div>
        </button>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="panel-section-title">{t("members.lookup.title")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            className="filter-select lookup-broker-select"
            aria-label={t("members.allBrokers")}
            value={lookupBroker}
            onChange={(e) => { setLookupBroker(e.target.value); setLookupResult("idle"); setWebhookPreview(null); }}
          >
            <option value="all">{t("members.allBrokers")}</option>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 200 }}>
            <input
              className="input"
              style={{ flex: 1, minWidth: 0 }}
              placeholder={t("members.lookup.placeholder")}
              value={lookupQuery}
              onChange={(e) => { setLookupQuery(e.target.value); setLookupResult("idle"); setWebhookPreview(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") lookupTradeId(); }}
            />
            <button className="btn btn-primary" style={{ flexShrink: 0 }} aria-label={t("members.lookup.check")} onClick={lookupTradeId}>
              <Icon name="search" />
            </button>
          </div>
        </div>
        {lookupResult === "not_found" && (
          <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-sub)" }}>
            <div>{t("members.lookup.notFound")}</div>
            <div style={{ marginTop: 6, fontSize: 12.5 }}>{t("members.lookup.webhookHint")}</div>
            <button className="btn btn-ghost" style={{ marginTop: 8, padding: "6px 12px" }} onClick={() => void checkWebhook()} disabled={webhookPreview?.loading || !backendLive}>
              <Icon name="query_stats" />
              {webhookPreview?.loading ? t("members.lookup.checkingWebhook") : t("members.lookup.checkWebhook")}
            </button>
            {webhookPreview && !webhookPreview.loading && (
              <div style={{ marginTop: 8, fontSize: 13, color: "var(--text)" }}>
                {webhookPreview.error ?? `${webhookPreview.message} (${lot(webhookPreview.lots ?? 0)} lots)`}
              </div>
            )}
          </div>
        )}
        {lookupAccount && (
          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 12px",
              background: "var(--bg-card2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              flexWrap: "wrap",
              cursor: lookupMember ? "pointer" : "default",
            }}
            onClick={() => lookupMember && router.push(`/crm/members/detail/?id=${lookupMember.id}`)}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{lookupMember ? lookupMember.name : t("ta.noneNotSignedUp")}</div>
              <div style={{ fontSize: 12.5, color: "var(--text-sub)" }}>
                {brokers.find((b) => b.id === lookupAccount.brokerId)?.name ?? "—"} · {lookupAccount.tradeId} · {lookupAccount.accountType || "—"}
              </div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon
                name={lookupAccount.verification === "verified" ? "check_circle" : "cancel"}
                style={{ color: lookupAccount.verification === "verified" ? "var(--green)" : "var(--red)", fontSize: 20 }}
              />
              <span className={`badge ${verificationBadgeClass(lookupAccount.verification)}`}>{t(verificationLabelKey(lookupAccount.verification))}</span>
            </span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="filters-wrap" ref={filtersRef}>
            <button
              type="button"
              className="btn btn-ghost filters-toggle"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <Icon name="filter_list" />
              {t("common.filters")}
            </button>
            <div className={`filters-fields${filtersOpen ? " open" : ""}`}>
              <select className="filter-select" aria-label="Filter by access status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                <option value="all">{t("common.all")} ({counts.all})</option>
                <option value="Active">{t("common.active")} ({counts.Active})</option>
                <option value="Expiring Soon">{t("common.expiringSoon")} ({counts["Expiring Soon"]})</option>
                <option value="Expired">{t("common.expired")} ({counts.Expired})</option>
                <option value="Suspended">{t("common.suspended")} ({counts.Suspended})</option>
                <option value="Pending">{t("common.pending")} ({counts.Pending})</option>
              </select>
              <select className="filter-select" aria-label="Filter by broker" value={brokerFilter} onChange={(e) => { setBrokerFilter(e.target.value); setPage(1); }}>
                <option value="all">{t("members.allBrokers")}</option>
                {brokers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <select className="filter-select" aria-label="Filter by plan" value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}>
                <option value="all">{t("members.allPlans")}</option>
                <option value="free">{PLAN_LABELS.free}</option>
                <option value="ib_partner">{PLAN_LABELS.ib_partner}</option>
              </select>
              <select
                className="filter-select"
                aria-label="Filter by customer stage"
                value={stageFilter}
                onChange={(e) => { setStageFilter(e.target.value as "all" | CustomerStage); setPage(1); }}
              >
                <option value="all">{t("members.allStages")}</option>
                <option value="new">{t("members.stage.new")}</option>
                <option value="existing">{t("members.stage.existing")}</option>
              </select>
              <select className="filter-select" aria-label="Filter by lot qualification" value={lotsFilter} onChange={(e) => applyLotsFilter(e.target.value as LotsFilter)}>
                <option value="all">{t("members.allLots")}</option>
                <option value="qualified">{t("members.lots.qualified")} ({qualificationCounts.qualified})</option>
                <option value="not_qualified">{t("members.lots.notQualified")} ({qualificationCounts.notQualified})</option>
              </select>
              <DateRangePicker value={dateRange} onChange={setDateRange} placeholder={t("members.joinedRange")} />
            </div>
          </div>
          <div className="search">
            <Icon name="search" />
            <input
              type="search"
              placeholder={t("members.searchPlaceholder")}
              aria-label="Search members"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            />
          </div>
          <div className="toolbar-actions">
            <button className="btn btn-ghost" onClick={exportMembers}>
              <Icon name="download" />
              {t("common.export")}
            </button>
            <button className="btn btn-primary" onClick={() => setDrawerMode({ kind: "form", member: null })}>
              <Icon name="add" />
              {t("members.addMember")}
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data" style={{ minWidth: 1800 }}>
            <thead>
              <tr>
                <th>{t("members.col.member")}</th>
                <th>{t("members.col.plan")}</th>
                <th>{t("members.col.phone")}</th>
                <th>{t("members.col.country")}</th>
                <th>{t("members.col.broker")}</th>
                <th>{t("members.col.tradeId")}</th>
                <th>{t("members.col.tradingview")}</th>
                <th>{t("members.col.telegram")}</th>
                <th>{t("members.col.indicator")}</th>
                <th className="sortable" onClick={() => toggleSort("lots")}>
                  {t("members.col.lots")}
                  <Icon name={sortIcon("lots")} style={{ fontSize: 15 }} />
                </th>
                <th>{t("members.col.accessStatus")}</th>
                <th className="sortable" onClick={() => toggleSort("startDate")}>
                  {t("members.col.startDate")}
                  <Icon name={sortIcon("startDate")} style={{ fontSize: 15 }} />
                </th>
                <th className="sortable" onClick={() => toggleSort("expiryDate")}>
                  {t("members.col.expiryDate")}
                  <Icon name={sortIcon("expiryDate")} style={{ fontSize: 15 }} />
                </th>
                <th>{t("members.col.joined")}</th>
                <th>{t("members.col.channel")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paged.length ? (
                paged.map((m) => {
                  const accts = memberTradeAccounts(m.id, tradeAccounts);
                  const multi = accts.length > 1;
                  const isOpen = expanded.has(m.id);
                  const access = accessOf(m.id);
                  const label = accessLabel(access, settings);
                  const lots = summaryLots(m);
                  const required = summaryRequired(m);
                  const stage = customerStage(m, indicatorAccess);
                  const primaryBroker = accts[0] ? brokers.find((b) => b.id === accts[0].brokerId)?.name ?? "—" : "—";
                  return (
                    <Fragment key={m.id}>
                      <tr className={multi ? "has-sub" : undefined} onClick={() => openDetail(m.id)} style={{ cursor: "pointer" }}>
                        <td>
                          <div className="cust">
                            <span className="avatar">{initials(m.name)}</span>
                            <div>
                              <div className="cn">{m.name}</div>
                              <div className="ce">{m.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`plan-pill ${m.plan === "ib_partner" ? "elite" : "free"}`}>{PLAN_LABELS[m.plan]}</span>
                          <br />
                          <span className={`badge ${customerStageBadgeClass(stage)}`} style={{ marginTop: 6 }}>
                            {t(`members.stage.${stage}`)}
                          </span>
                          <br />
                          <span className={`badge ${memberLevels.get(m.id) === "premium" ? "active" : memberLevels.get(m.id) === "standard" ? "pending" : "suspended"}`} style={{ marginTop: 6 }}>
                            {t(MEMBER_LEVEL_LABEL_KEYS[memberLevels.get(m.id) ?? "basic"])}
                          </span>
                        </td>
                        <td className="mono">{m.phone || "—"}</td>
                        <td>{m.country || "—"}</td>
                        <td>
                          {multi ? (
                            <>
                              <button
                                className={`expand-btn${isOpen ? " open" : ""}`}
                                data-noopen
                                aria-label={`Show trade accounts for ${m.name}`}
                                aria-expanded={isOpen}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpand(m.id);
                                }}
                              >
                                <Icon name="chevron_right" />
                              </button>
                              {primaryBroker} <span className="multi-badge">+{accts.length - 1}</span>
                            </>
                          ) : (
                            primaryBroker
                          )}
                        </td>
                        <td className="mono">{accts.length ? (multi ? `${accts[0].tradeId} · ${accts.length} ${t("members.accounts")}` : accts[0].tradeId) : "—"}</td>
                        <td className="mono">{m.tv}</td>
                        <td className="mono">{m.telegramUsername || "—"}</td>
                        <td>
                          {access?.indicator ?? "—"}
                          {memberIndicatorAccess(m.id, indicatorAccess).length > 1 && (
                            <span className="multi-badge">+{memberIndicatorAccess(m.id, indicatorAccess).length - 1}</span>
                          )}
                        </td>
                        <td>
                          <span className={`lots ${lots >= required ? "met" : "risk"}`} title={snapshotStale(m) ? t("members.lotsStale") : undefined}>
                            {lot(lots)}
                            <span className="req">/ {lot(required)}</span>
                            {snapshotStale(m) && (
                              <span className="badge pending" style={{ marginLeft: 6 }}>
                                <Icon name="schedule" style={{ fontSize: 12 }} />
                                {t("members.lotsStaleBadge")}
                              </span>
                            )}
                            {m.requiredLotsOverride != null && (
                              <span className="badge suspended" style={{ marginLeft: 6 }} title={m.requiredLotsOverrideNote || undefined}>
                                {t("members.customTarget")}
                              </span>
                            )}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${accessBadgeClass(label)}`}>{t(accessLabelKey(label))}</span>
                        </td>
                        <td className="mono">{fmtDate(access?.startDate ?? m.crmStartDate)}</td>
                        <td className="mono">{fmtDate(access?.expiryDate ?? m.crmExpiryDate)}</td>
                        <td className="mono">{fmtDate(m.joinedDate)}</td>
                        <td>
                          {m.channels?.length ? (
                            <div className="channel-tags">
                              {m.channels.map((c) => (
                                <span className="channel-tag" key={c}>
                                  {ACQUISITION_CHANNEL_LABELS[c]}
                                </span>
                              ))}
                            </div>
                          ) : (
                            t("members.channel.none")
                          )}
                        </td>
                        <td className="row-actions" data-noopen>
                          <button
                            className="btn btn-ghost row-mini-btn"
                            title={t("members.row.addIndicator")}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDrawerMode({ kind: "access", member: m });
                            }}
                          >
                            <Icon name="add_circle" />
                            {t("members.row.addIndicator")}
                          </button>
                          <button
                            className="btn btn-ghost row-mini-btn"
                            title={t("members.row.renew")}
                            disabled={renewingId === m.id || !memberIndicatorAccess(m.id, indicatorAccess).length}
                            onClick={(e) => {
                              e.stopPropagation();
                              void renewFromRow(m);
                            }}
                          >
                            <Icon name="autorenew" />
                            {t("members.row.renew")}
                          </button>
                          <button
                            className="kebab"
                            aria-label={`Open ${m.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetail(m.id);
                            }}
                          >
                            <Icon name="more_vert" />
                          </button>
                        </td>
                      </tr>
                      {multi && (
                        <tr className="cust-sub" hidden={!isOpen} key={`${m.id}-sub`}>
                          <td></td>
                          <td colSpan={15}>
                            <div className="sub-accts">
                              <div className="sub-acct-head">
                                <span>{t("members.subCol.broker")}</span>
                                <span>{t("members.subCol.tradeId")}</span>
                                <span>{t("members.subCol.accountType")}</span>
                                <span>{t("members.subCol.lots")}</span>
                                <span>{t("members.subCol.verified")}</span>
                              </div>
                              {accts.map((a) => (
                                <div className="sub-acct" key={a.id}>
                                  <span className="sa-broker">
                                    <span className="sa-dot"></span>
                                    {brokers.find((b) => b.id === a.brokerId)?.name ?? "—"}
                                  </span>
                                  <span className="sa-acct mono">{a.tradeId}</span>
                                  <span className="sa-type">{a.accountType || "—"}</span>
                                  <span className="sa-lots mono">{lot(accountLots(a.id, tradeLogs))}</span>
                                  <span className="sa-status">
                                    <span className={`badge ${verificationBadgeClass(a.verification)}`}>{t(verificationLabelKey(a.verification))}</span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={16}>
                    <div className="table-empty">{t("members.empty")}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>{t("members.footerCount", { n: list.length })}</span>
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.length} onPageChange={goToPage} />
        </div>
      </div>

      <Drawer
        open={!!drawerMode}
        title={title}
        onClose={closeDrawer}
        body={
          drawerMode?.kind === "form" ? (
            <MemberForm ref={formRef} member={drawerMode.member} onDone={closeDrawer} />
          ) : drawerMode?.kind === "access" ? (
            <MemberIndicatorAccessPanel member={drawerMode.member} />
          ) : null
        }
        foot={
          drawerMode?.kind === "form" ? (
            <>
              <button className="btn btn-ghost" onClick={closeDrawer}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={() => formRef.current?.save()}>
                {drawerMode.member ? t("common.saveChanges") : t("members.addMember")}
              </button>
            </>
          ) : drawerMode?.kind === "access" ? (
            <button className="btn btn-ghost" onClick={closeDrawer}>
              {t("common.close")}
            </button>
          ) : null
        }
      />
    </section>
  );
}
