"use client";

import { useRef, useState } from "react";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { useCrm, accessLabel, accessBadgeClass, accessLabelKey, progressTone, currentMonthRange, fmtDate, lot } from "../../../components/crm/CrmContext";
import { useCustomerData } from "../../../components/dashboard/useCustomerData";
import VerifyResultModal, { type VerifyResult } from "../../../components/crm/VerifyResultModal";
import Icon from "../../../components/Icon";

export default function DashboardIndicatorsPage() {
  const { t } = useLanguage();
  const { settings, indicatorAccess, indicators, members, setMembers } = useCrm();
  const { member, thisMonthLots, requiredLots } = useCustomerData();
  const myAccess = indicatorAccess.filter((a) => a.memberId === member.id);
  const lotTone = progressTone(thisMonthLots, requiredLots);
  const lotPct = Math.min(100, requiredLots > 0 ? (thisMonthLots / requiredLots) * 100 : 100);
  const lotPeriod = currentMonthRange();
  const remainingLots = Math.max(0, requiredLots - thisMonthLots);

  const rows = myAccess.map((a) => {
    const indicator = indicators.find((i) => i.name === a.indicator);
    const isFree = indicator !== undefined && settings.planEntitlements.free.includes(indicator.id);
    // BeSight ONE's broker-sourced access depends on this month's lot
    // quota — falling short locks it immediately rather than waiting for
    // the CRM's periodic renewal check to expire it.
    const isLotLocked = a.indicator === "BeSight ONE" && thisMonthLots < requiredLots;
    const label = accessLabel(a, settings);
    return { access: a, indicator, isFree, isLotLocked, label };
  });
  const activeCount = rows.filter((r) => !r.isLotLocked && r.label === "Active").length;

  const [query, setQuery] = useState("");
  const filteredRows = query.trim() ? rows.filter((r) => r.access.indicator.toLowerCase().includes(query.trim().toLowerCase())) : rows;

  const [tv, setTv] = useState(member.tv);
  const [tvResult, setTvResult] = useState<VerifyResult | null>(null);
  const tvInputRef = useRef<HTMLInputElement>(null);

  function verifyTv() {
    const value = tv.trim();
    if (!value) {
      setTvResult({ status: "fail", title: t("dash.indicators.tv.result.emptyTitle"), detail: t("dash.indicators.tv.result.emptyDetail") });
      return;
    }
    const duplicate = members.some((m) => m.id !== member.id && m.tv.toLowerCase() === value.toLowerCase());
    if (duplicate) {
      setTvResult({
        status: "fail",
        title: t("dash.indicators.tv.result.duplicateTitle"),
        detail: t("dash.indicators.tv.result.duplicateDetail", { username: value }),
      });
      return;
    }
    setMembers((cur) => cur.map((m) => (m.id === member.id ? { ...m, tv: value } : m)));
    setTvResult({
      status: "pass",
      title: t("dash.indicators.tv.result.successTitle"),
      detail: t("dash.indicators.tv.result.successDetail", { username: value }),
    });
  }

  return (
    <>
      <div className="stat-grid cols-3">
        <div className="stat-card stat-card-ind-total">
          <div className="value">
            {myAccess.length}
            <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-sub)", marginLeft: 4 }}>{t("dash.indicators.unit.items")}</span>
          </div>
          <div className="label">{t("dash.indicators.stat.total")}</div>
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative deco graphic, sized/cropped by CSS */}
          <img className="stat-card-deco" src="/img/dashboard-ui/indicator-a.png" alt="" aria-hidden="true" />
        </div>

        <div className="stat-card stat-card-ind-active">
          <div className="value">
            {activeCount}
            <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-sub)", marginLeft: 4 }}>{t("dash.indicators.unit.items")}</span>
          </div>
          <div className="label">{t("dash.indicators.stat.active")}</div>
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative deco graphic, sized/cropped by CSS */}
          <img className="stat-card-deco" src="/img/dashboard-ui/active-in.png" alt="" aria-hidden="true" />
        </div>

        <div className="stat-card stat-card-ind-lots">
          <div className="value">{t("lm.lotsLabel", { lots: lot(thisMonthLots), required: lot(requiredLots) })}</div>
          <div className="label">{t("dash.indicators.stat.lotsThisMonth")}</div>
          <div className="stat-subnote">
            {fmtDate(lotPeriod.from)} – {fmtDate(lotPeriod.to)}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative deco graphic, sized/cropped by CSS */}
          <img className="stat-card-deco" src="/img/dashboard-ui/grow-m.png" alt="" aria-hidden="true" />
        </div>
      </div>

      <div className="card ind-entitlement">
        <div className="ind-entitlement-top">
          <div className="ind-entitlement-text">
            <div className="ind-entitlement-title">{t("dash.indicators.entitlement.title")}</div>
            <div className="ind-entitlement-subtitle">{t("dash.indicators.lotProgress.title")}</div>
          </div>
          <div className="ind-entitlement-value">
            <div className="ind-entitlement-lots">{t("lm.lotsLabel", { lots: lot(thisMonthLots), required: lot(requiredLots) })}</div>
            <div className="ind-entitlement-period">
              {fmtDate(lotPeriod.from)} – {fmtDate(lotPeriod.to)}
            </div>
          </div>
        </div>
        <div className="ind-entitlement-bottom">
          <div className={`lot-progress ${lotTone}`} style={{ flex: 1, minWidth: 0 }}>
            <div className="lp-track">
              <span className="lp-fill" style={{ width: `${lotPct}%` }} />
            </div>
          </div>
          <div className="ind-entitlement-pill">
            <span className={`badge ${lotTone === "met" ? "active" : lotTone === "close" ? "warning" : "expired"}`}>
              <Icon name={lotTone === "met" ? "check_circle" : "error"} style={{ fontSize: 14 }} />
              {t(lotTone === "met" ? "dash.indicators.entitlement.met" : "dash.indicators.entitlement.notMet")}
            </span>
            <div className="ind-entitlement-pill-note">
              {t(lotTone === "met" ? "dash.indicators.entitlement.metNote" : "dash.indicators.entitlement.notMetNote", { remaining: lot(remainingLots) })}
            </div>
          </div>
        </div>
      </div>

      <div className="card indicators-card">
        <div className="ind-list-head">
          <div className="ind-list-head-text">
            <div className="ind-entitlement-title">{t("dash.indicators.list.title")}</div>
            <div className="ind-entitlement-subtitle">{t("dash.indicators.list.subtitle")}</div>
          </div>
          <div className="search" style={{ flex: "0 1 260px" }}>
            <Icon name="search" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("dash.indicators.list.searchPlaceholder")}
              aria-label={t("dash.indicators.list.searchPlaceholder")}
            />
          </div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("dash.indicators.col.name")}</th>
                <th>{t("dash.indicators.col.status")}</th>
                <th>{t("dash.indicators.col.source")}</th>
                <th>{t("dash.indicators.col.start")}</th>
                <th>{t("dash.indicators.col.expiry")}</th>
                <th>{t("dash.indicators.col.link")}</th>
                <th>{t("dash.indicators.col.addon")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length ? (
                filteredRows.map(({ access: a, indicator, isFree, isLotLocked, label }) => {
                  const pubId = indicator?.pubId;
                  return (
                    <tr key={a.id} style={isLotLocked ? { opacity: 0.6 } : undefined}>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                          {a.indicator}
                          <span className={`plan-pill ${isFree ? "free" : "pro"}`} style={{ fontSize: 11, padding: "2px 8px" }}>
                            {isFree ? t("dash.indicators.plan.free") : t("dash.indicators.plan.premium")}
                          </span>
                        </span>
                      </td>
                      <td>
                        {isLotLocked ? (
                          <span className="badge suspended">
                            <Icon name="lock" style={{ fontSize: 13 }} />
                            {t("dash.indicators.status.locked")}
                          </span>
                        ) : (
                          <span className={`badge ${accessBadgeClass(label)}`}>{t(accessLabelKey(label))}</span>
                        )}
                      </td>
                      <td>{a.source}</td>
                      <td>{fmtDate(a.startDate)}</td>
                      <td>{fmtDate(a.expiryDate)}</td>
                      <td>
                        {isLotLocked ? (
                          <span style={{ fontSize: 12, color: "var(--text-sub)" }}>{t("dash.indicators.lockedNote", { required: lot(requiredLots) })}</span>
                        ) : pubId ? (
                          <a
                            className="btn btn-ghost"
                            style={{ padding: "6px 12px", minWidth: "auto", display: "inline-flex" }}
                            href={`https://www.tradingview.com/script/${pubId}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t("dash.indicators.openLink")}
                            <Icon name="open_in_new" style={{ fontSize: 15 }} />
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {indicator?.eaFile ? (
                          <a
                            className="btn btn-ghost"
                            style={{ padding: "6px 12px", minWidth: "auto", display: "inline-flex" }}
                            href={indicator.eaFile}
                            download
                          >
                            <Icon name="download" style={{ fontSize: 15 }} />
                            {t("dash.indicators.downloadEa")}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="table-empty">
                    {query.trim() ? t("dash.indicators.list.noResults") : t("dash.indicators.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ind-bottom-row">
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative brand mark, sized inline */}
            <img src="/img/tradingview/Black/square-rounded-logo-black.svg" alt="TradingView" style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 6 }} />
            <div className="panel-section-title" style={{ margin: 0, flex: 1 }}>
              {t("dash.indicators.tv.title")}
            </div>
            {member.tv && (
              <span className="badge active">
                <Icon name="check_circle" style={{ fontSize: 14 }} />
                {t("dash.indicators.tv.linked")}
              </span>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: "var(--text-sub)", margin: "8px 0 16px" }}>{t("dash.indicators.tv.detail")}</p>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
              <label>{t("dash.profile.field.username")}</label>
              <input ref={tvInputRef} className="input" value={tv} onChange={(e) => setTv(e.target.value)} placeholder={t("dash.indicators.tv.placeholder")} />
            </div>
            <button className="btn btn-primary" onClick={verifyTv}>
              <Icon name="check_circle" />
              {t("dash.indicators.tv.verify")}
            </button>
          </div>
        </div>

        <div className="card ind-tips">
          <div className="ind-tips-title">{t("dash.indicators.tips.title")}</div>
          <p className="ind-tips-body">{t("dash.indicators.tips.body")}</p>
          <button
            type="button"
            className="ind-tips-link"
            onClick={() => {
              tvInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              tvInputRef.current?.focus();
            }}
          >
            {t("dash.indicators.tips.linkText")}
            <Icon name="arrow_forward" style={{ fontSize: 14 }} />
          </button>
        </div>
      </div>

      <VerifyResultModal result={tvResult} onClose={() => setTvResult(null)} />
    </>
  );
}
