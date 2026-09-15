"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import Icon from "../../../components/Icon";
import Drawer from "../../../components/crm/Drawer";
import MemberForm from "../../../components/crm/MemberForm";
import DateRangePicker from "../../../components/crm/DateRangePicker";
import Pagination from "../../../components/crm/Pagination";
import { exportCsv } from "../../../lib/exportCsv";

type DrawerMode = { kind: "form"; member: Member | null } | null;
const PAGE_SIZE = 50;

export default function MembersPage() {
  const { members, tradeAccounts, tradeLogs, indicatorAccess, brokers, settings, toast, memberSyncStatus, memberSyncError, refreshMembers } = useCrm();
  const { t } = useLanguage();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("all");
  const [brokerFilter, setBrokerFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState<"all" | CustomerStage>("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [lookupBroker, setLookupBroker] = useState(() => String(brokers.find((b) => b.name === "XM")?.id ?? "all"));
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResult, setLookupResult] = useState<"idle" | "not_found" | number>("idle");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<"lots" | "startDate" | "expiryDate" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  const accessOf = (memberId: number) => primaryIndicatorAccess(memberId, indicatorAccess);

  function lookupTradeId() {
    const q = lookupQuery.trim().toLowerCase();
    if (!q) return;
    const found = tradeAccounts.find((a) => a.tradeId.toLowerCase() === q && (lookupBroker === "all" || a.brokerId === Number(lookupBroker)));
    setLookupResult(found ? found.id : "not_found");
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
    let qualified = 0;
    for (const m of members) {
      const lots = memberLots(m, tradeAccounts, tradeLogs, settings, memberLotRange(m));
      const required = requiredLotsFor(m, settings);
      if (qualification(lots, required) === "qualified") qualified++;
    }
    return { qualified, notQualified: members.length - qualified };
  }, [members, tradeAccounts, tradeLogs, settings]);

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
      .filter((m) => !dateRange.from || m.joinedDate >= dateRange.from)
      .filter((m) => !dateRange.to || m.joinedDate <= dateRange.to)
      .filter((m) => !q || (m.name + " " + m.email + " " + m.tv + " " + (m.telegramUsername ?? "") + " " + m.code).toLowerCase().includes(q));

    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "lots") {
        return (memberLots(a, tradeAccounts, tradeLogs, settings, memberLotRange(a)) - memberLots(b, tradeAccounts, tradeLogs, settings, memberLotRange(b))) * dir;
      }
      const av = (sortKey === "startDate" ? accessOf(a.id)?.startDate ?? a.crmStartDate : accessOf(a.id)?.expiryDate ?? a.crmExpiryDate) ?? "";
      const bv = (sortKey === "startDate" ? accessOf(b.id)?.startDate ?? b.crmStartDate : accessOf(b.id)?.expiryDate ?? b.crmExpiryDate) ?? "";
      return av.localeCompare(bv) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, statusFilter, brokerFilter, planFilter, stageFilter, dateRange, query, tradeAccounts, tradeLogs, indicatorAccess, settings, sortKey, sortDir]);

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
        access?.indicator ?? "", memberLots(m, tradeAccounts, tradeLogs, settings, memberLotRange(m)), requiredLotsFor(m, settings),
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

  const title = drawerMode?.kind === "form" ? (drawerMode.member ? t("members.drawer.edit") : t("members.drawer.add")) : "";

  return (
    <section className="panel is-active">
      <div className={`sync-banner ${memberSyncStatus}`}>
        <span className="sync-dot" />
        <div>
          <strong>{memberSyncStatus === "live" ? "ข้อมูลสมาชิกจาก CRM" : memberSyncStatus === "loading" ? "กำลังซิงก์ข้อมูลสมาชิก" : memberSyncStatus === "error" ? "ยังใช้ข้อมูลตัวอย่างอยู่" : "ข้อมูลสมาชิก"}</strong>
          <span>{memberSyncStatus === "live" ? `ซิงก์แล้ว ${members.length.toLocaleString()} คน` : memberSyncStatus === "error" ? memberSyncError : "กำลังเชื่อมต่อ CRM"}</span>
        </div>
        <button className="kebab" aria-label="ซิงก์ข้อมูลสมาชิกใหม่" title="ซิงก์ข้อมูลสมาชิกใหม่" onClick={() => void refreshMembers()} disabled={memberSyncStatus === "loading"}>
          <Icon name="sync" />
        </button>
      </div>
      <div className="stat-grid cols-3">
        <div className="stat-card">
          <div className="value">{settings.requiredLots.toFixed(2)}</div>
          <div className="label">{t("lm.requiredLotsCard")}</div>
        </div>
        <div className="stat-card">
          <div className="value">{qualificationCounts.qualified}</div>
          <div className="label">{t("lm.qualifiedThisMonth")}</div>
        </div>
        <div className="stat-card">
          <div className="value">{qualificationCounts.notQualified}</div>
          <div className="label">{t("lm.notYetQualified")}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="panel-section-title">{t("members.lookup.title")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            className="filter-select lookup-broker-select"
            aria-label={t("members.allBrokers")}
            value={lookupBroker}
            onChange={(e) => { setLookupBroker(e.target.value); setLookupResult("idle"); }}
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
              onChange={(e) => { setLookupQuery(e.target.value); setLookupResult("idle"); }}
              onKeyDown={(e) => { if (e.key === "Enter") lookupTradeId(); }}
            />
            <button className="btn btn-primary" style={{ flexShrink: 0 }} aria-label={t("members.lookup.check")} onClick={lookupTradeId}>
              <Icon name="search" />
            </button>
          </div>
        </div>
        {lookupResult === "not_found" && (
          <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-sub)" }}>{t("members.lookup.notFound")}</div>
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
                  const lots = memberLots(m, tradeAccounts, tradeLogs, settings, memberLotRange(m));
                  const required = requiredLotsFor(m, settings);
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
                          <span className={`lots ${lots >= required ? "met" : "risk"}`}>
                            {lot(lots)}
                            <span className="req">/ {lot(required)}</span>
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
        body={drawerMode?.kind === "form" ? <MemberForm ref={formRef} member={drawerMode.member} onDone={closeDrawer} /> : null}
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
          ) : null
        }
      />
    </section>
  );
}
