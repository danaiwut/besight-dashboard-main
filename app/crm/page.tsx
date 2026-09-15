"use client";

import { useState } from "react";
import { useCrm, accessLabel, primaryIndicatorAccess, memberLots, requiredLotsFor, initials, fmtDate } from "../../components/crm/CrmContext";
import { useLanguage } from "../../components/crm/LanguageContext";
import Icon from "../../components/Icon";

type ChartMetric = "new" | "total" | "activeTraders";

export default function CrmOverviewPage() {
  const { members, tradeAccounts, tradeLogs, indicatorAccess, settings } = useCrm();
  const { t } = useLanguage();
  const [chartMetric, setChartMetric] = useState<ChartMetric>("new");
  const [chartYear, setChartYear] = useState(() => new Date().getFullYear());

  const accessOf = (memberId: number) => primaryIndicatorAccess(memberId, indicatorAccess);
  const labels = members.map((m) => accessLabel(accessOf(m.id), settings));

  const total = members.length;
  const active = labels.filter((l) => l === "Active").length;
  const expiringSoon = labels.filter((l) => l === "Expiring Soon").length;
  const expired = labels.filter((l) => l === "Expired").length;

  const lotsPerMember = members.map((m) => memberLots(m, tradeAccounts, tradeLogs, settings));
  const qualifiedLots = members.filter((m, i) => lotsPerMember[i] >= requiredLotsFor(m, settings)).length;
  const totalLots = lotsPerMember.reduce((s, l) => s + l, 0);

  const recent = [...members].sort((a, b) => b.joinedDate.localeCompare(a.joinedDate)).slice(0, 5);

  const distribution: { label: string; count: number }[] = [
    { label: t("common.active"), count: active },
    { label: t("common.expiringSoon"), count: expiringSoon },
    { label: t("common.expired"), count: expired },
    { label: t("ov.suspendedPending"), count: total - active - expiringSoon - expired },
  ];

  const monthKey = (d: string) => d.slice(0, 7);
  const monthKeyOf = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;

  const chartYears = (() => {
    const years = new Set([
      ...members.map((m) => Number(m.joinedDate.slice(0, 4))),
      ...tradeAccounts.map((a) => Number(a.createdDate.slice(0, 4))),
      new Date().getFullYear(),
    ]);
    return Array.from(years).sort((a, b) => b - a);
  })();

  const monthsOfYear = Array.from({ length: 12 }, (_, i) => monthKeyOf(chartYear, i));
  const chartByMonth = monthsOfYear.map((mo, i) => {
    const monthLabel = new Date(chartYear, i, 1).toLocaleDateString("en-US", { month: "short" });
    let count: number;
    if (chartMetric === "new") {
      count = members.filter((m) => monthKey(m.joinedDate) === mo).length;
    } else if (chartMetric === "total") {
      count = members.filter((m) => monthKey(m.joinedDate) <= mo).length;
    } else {
      count = new Set(tradeAccounts.filter((a) => monthKey(a.createdDate) === mo).map((a) => a.memberId)).size;
    }
    return { month: monthLabel, count };
  });
  const maxChartCount = Math.max(1, ...chartByMonth.map((m) => m.count));
  const chartTitleKey = chartMetric === "new" ? "ov.newMembersPerMonth" : chartMetric === "total" ? "ov.totalMembersPerMonth" : "ov.activeTradersPerMonth";

  return (
    <section className="panel is-active">
      <div className="stat-grid cols-5">
        <div className="stat-card">
          <div className="top">
            <span className="stat-icon c1">
              <Icon name="group" />
            </span>
          </div>
          <div className="value">{total}</div>
          <div className="label">{t("ov.totalMembers")}</div>
        </div>
        <div className="stat-card">
          <div className="top">
            <span className="stat-icon c2">
              <Icon name="check_circle" />
            </span>
          </div>
          <div className="value">{active}</div>
          <div className="label">{t("ov.activeMembers")}</div>
        </div>
        <div className="stat-card">
          <div className="top">
            <span className="stat-icon c3">
              <Icon name="schedule" />
            </span>
            <span className="stat-trend" style={{ color: expiringSoon ? "var(--amber)" : "var(--green)" }}>
              {expiringSoon ? t("ov.watch") : t("ov.ok")}
            </span>
          </div>
          <div className="value">{expiringSoon}</div>
          <div className="label">{t("ov.expiringWithin", { days: settings.expiringSoonDays })}</div>
        </div>
        <div className="stat-card">
          <div className="top">
            <span className="stat-icon c5">
              <Icon name="cancel" />
            </span>
            <span className="stat-trend down">{expired ? t("ov.action") : t("ov.ok")}</span>
          </div>
          <div className="value">{expired}</div>
          <div className="label">{t("ov.expiredAccess")}</div>
        </div>
        <div className="stat-card">
          <div className="top">
            <span className="stat-icon c4">
              <Icon name="task_alt" />
            </span>
            <span className="stat-trend">{t("ov.qualifiedThisMonth")}</span>
          </div>
          <div className="value">{qualifiedLots}</div>
          <div className="label">{t("ov.qualifiedLots")}</div>
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: "1fr" }}>
        <div className="stat-card">
          <div className="top">
            <span className="stat-icon c1">
              <Icon name="bar_chart" />
            </span>
            <span className="stat-trend">{t("ov.requiredPerMo", { n: settings.requiredLots.toFixed(2) })}</span>
          </div>
          <div className="value">{totalLots.toFixed(2)}</div>
          <div className="label">{t("ov.totalLots")}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 32 }}>
          <div className="panel-section-title" style={{ margin: 0 }}>{t(chartTitleKey)}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <select className="filter-select" aria-label={t("ov.metricFilter")} value={chartMetric} onChange={(e) => setChartMetric(e.target.value as ChartMetric)}>
              <option value="new">{t("ov.metric.new")}</option>
              <option value="total">{t("ov.metric.total")}</option>
              <option value="activeTraders">{t("ov.metric.activeTraders")}</option>
            </select>
            <select className="filter-select" aria-label={t("ov.yearFilter")} value={chartYear} onChange={(e) => setChartYear(Number(e.target.value))}>
              {chartYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, padding: "0 4px" }}>
          {chartByMonth.map((m) => (
            <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{m.count}</span>
              <div
                style={{
                  width: "100%",
                  maxWidth: 28,
                  height: `${Math.max(6, (m.count / maxChartCount) * 84)}px`,
                  borderRadius: 6,
                  background: "var(--gradient-cta)",
                }}
              />
              <span style={{ fontSize: 11.5, color: "var(--text-sub)" }}>{m.month}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ov-cols">
        <div className="card" style={{ padding: 20 }}>
          <div className="panel-section-title">{t("ov.accessDistribution")}</div>
          {distribution.map((d) => {
            const pct = total ? Math.round((d.count / total) * 100) : 0;
            return (
              <div className="dist-row" key={d.label}>
                <span className="dn">{d.label}</span>
                <div className="dist-bar">
                  <span style={{ width: `${pct}%` }}></span>
                </div>
                <span className="dv">{d.count}</span>
              </div>
            );
          })}
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="panel-section-title">{t("ov.recentMembers")}</div>
          {recent.map((m) => (
            <div className="mini-item" key={m.id}>
              <span className="avatar">{initials(m.name)}</span>
              <div>
                <div className="mn">{m.name}</div>
                <div className="me">{m.code}</div>
              </div>
              <span className="mmeta">{fmtDate(m.joinedDate)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
