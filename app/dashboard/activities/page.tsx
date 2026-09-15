"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { useCrm, fmtDate } from "../../../components/crm/CrmContext";
import { COMPETITIONS, type CompStatus } from "../../../lib/activities";
import Icon from "../../../components/Icon";

const TABS: { key: "all" | CompStatus; labelKey: string }[] = [
  { key: "all", labelKey: "dash.activities.tabs.all" },
  { key: "upcoming", labelKey: "dash.activities.tabs.upcoming" },
  { key: "live", labelKey: "dash.activities.tabs.live" },
  { key: "finished", labelKey: "dash.activities.tabs.finished" },
];

export default function DashboardActivitiesPage() {
  const { t } = useLanguage();
  const { toast } = useCrm();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");

  const list = tab === "all" ? COMPETITIONS : COMPETITIONS.filter((c) => c.status === tab);

  return (
    <>
      <div className="comp-hero">
        <div className="comp-hero-text">
          <h2>{t("dash.activities.hero.title")}</h2>
          <p>{t("dash.activities.hero.subtitle")}</p>
          <div className="comp-hero-tags">
            <span className="comp-tag">
              <Icon name="check_circle" /> {t("dash.activities.hero.tag.free")}
            </span>
            <span className="comp-tag">
              <Icon name="calendar_month" /> {t("dash.activities.hero.tag.monthly")}
            </span>
            <span className="comp-tag">
              <Icon name="account_balance_wallet" /> {t("dash.activities.hero.tag.equity")}
            </span>
            <span className="comp-tag">
              <Icon name="show_chart" /> {t("dash.activities.hero.tag.platform")}
            </span>
            <span className="comp-tag">
              <Icon name="storefront" /> {t("dash.activities.hero.tag.brokers")}
            </span>
            <span className="comp-tag">
              <Icon name="emoji_events" /> {t("dash.activities.hero.tag.count", { n: COMPETITIONS.length })}
            </span>
          </div>
        </div>
        <Icon name="emoji_events" className="comp-hero-trophy" />
      </div>

      <div className="comp-tabs" role="tablist" aria-label={t("dash.activities.hero.title")}>
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            role="tab"
            aria-selected={tab === tb.key}
            className={`comp-tab${tab === tb.key ? " is-active" : ""}`}
            onClick={() => setTab(tb.key)}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      <h2 className="rewards-programs-title">{t("dash.activities.listTitle")}</h2>

      {list.length === 0 ? (
        <div className="comp-empty">{t("dash.activities.empty")}</div>
      ) : (
        <div className="comp-grid">
          {list.map((c) => {
            const monthName = t(`common.month.${c.month}`);
            return (
              <div className="comp-card" key={c.key}>
                <div className="comp-card-banner">
                  <span className={`comp-ribbon comp-ribbon-${c.status}`}>
                    {c.status === "upcoming" && t("dash.activities.ribbon.upcoming", { start: fmtDate(c.rangeStart), end: fmtDate(c.rangeEnd) })}
                    {c.status === "live" && t("dash.activities.liveBadge")}
                    {c.status === "finished" && t("dash.activities.ribbon.finished", { date: fmtDate(c.rangeEnd) })}
                  </span>
                  <Icon name="emoji_events" className="comp-card-icon" />
                </div>
                <div className="comp-card-body">
                  <div className="comp-card-meta">
                    <Icon name="groups" style={{ fontSize: 15 }} />
                    {t("dash.activities.traders", { n: c.traders })}
                    <Link href="/dashboard/leaderboard">{t("dash.activities.leaderboard")}</Link>
                    {c.status === "live" && <span className="comp-live-dot">{t("dash.activities.liveBadge")}</span>}
                  </div>
                  <div className="comp-card-title">{t("dash.activities.competitionTitle", { month: monthName, year: c.year })}</div>
                  <p className="comp-card-desc">
                    {t("dash.activities.prizeText")}{" "}
                    <button type="button" className="comp-rules-link" onClick={() => toast(t("dash.activities.rulesToast"))}>
                      {t("dash.activities.rulesLink")}
                    </button>
                  </p>
                  <div className="comp-card-actions">
                    <Link href={`/dashboard/activities/${c.key}`} className="btn btn-ghost">
                      {t("dash.activity.viewDetails")}
                    </Link>
                    <button
                      type="button"
                      className={`btn ${c.status === "upcoming" ? "btn-primary" : "btn-ghost"}`}
                      disabled={c.status !== "upcoming"}
                      onClick={() => toast(t("dash.activities.enrollToast", { month: monthName }))}
                    >
                      {t("dash.activities.enroll")}
                      <Icon name="arrow_forward" style={{ fontSize: 15 }} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
