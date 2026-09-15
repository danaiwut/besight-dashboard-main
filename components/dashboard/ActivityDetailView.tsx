"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "../crm/LanguageContext";
import { useCrm, fmtDate } from "../crm/CrmContext";
import Icon from "../Icon";
import { competitionByKey, competitionLeaderboard, prizeForRank, PRIZE_POOL, PRIZE_TIERS, RULE_KEYS } from "../../lib/activities";

// 12 placeholder portraits cycled by member id (or by rank, for the
// anonymized ranks-11-to-20 rows that have no real member behind them) —
// same local demo-avatar set used on the main Leaderboard page.
const AVATAR_COUNT = 12;
function avatarFor(id: number): string {
  return `/img/avatars/avatar-${((id - 1) % AVATAR_COUNT) + 1}.png`;
}

const LB_PAGE_SIZE = 10;

export default function ActivityDetailView({ slug }: { slug: string }) {
  const { t } = useLanguage();
  const { toast, members } = useCrm();
  const [lbPage, setLbPage] = useState(1);

  const competition = competitionByKey(slug);
  if (!competition) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <p>{t("dash.activities.empty")}</p>
        <Link href="/dashboard/activities" className="btn btn-ghost" style={{ marginTop: 12 }}>
          {t("dash.activity.back")}
        </Link>
      </div>
    );
  }

  const monthName = t(`common.month.${competition.month}`);
  const title = t("dash.activities.competitionTitle", { month: monthName, year: competition.year });
  const leaderboardRows = competitionLeaderboard(competition);
  const lbTotalPages = Math.max(1, Math.ceil(leaderboardRows.length / LB_PAGE_SIZE));
  const lbPageRows = leaderboardRows.slice((lbPage - 1) * LB_PAGE_SIZE, lbPage * LB_PAGE_SIZE);

  return (
    <div>
      <Link href="/dashboard/activities" className="course-detail-back">
        <Icon name="arrow_back" />
        {t("dash.activity.back")}
      </Link>

      <div className="profile-grid activity-detail-grid">
        <div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="activity-detail-cover">
              <span className={`comp-ribbon comp-ribbon-${competition.status}`}>
                {competition.status === "upcoming" &&
                  t("dash.activities.ribbon.upcoming", { start: fmtDate(competition.rangeStart), end: fmtDate(competition.rangeEnd) })}
                {competition.status === "live" && t("dash.activities.liveBadge")}
                {competition.status === "finished" && t("dash.activities.ribbon.finished", { date: fmtDate(competition.rangeEnd) })}
              </span>
              <Icon name="emoji_events" className="activity-detail-cover-icon" />
            </div>
            <div className="activity-detail-body">
              <h1 className="activity-detail-title">{title}</h1>
              <div className="activity-detail-meta">
                <span>
                  <Icon name="groups" style={{ fontSize: 15 }} />
                  {t("dash.activities.traders", { n: competition.traders })}
                </span>
                <Link href="/dashboard/leaderboard">{t("dash.activities.leaderboard")}</Link>
              </div>

              {competition.status === "upcoming" ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: 16, alignSelf: "flex-start" }}
                  onClick={() => toast(t("dash.activities.enrollToast", { month: monthName }))}
                >
                  {t("dash.activities.enroll")}
                  <Icon name="arrow_forward" style={{ fontSize: 15 }} />
                </button>
              ) : competition.status === "finished" ? (
                <div className="activity-finished-note">{t("dash.activity.finishedNote")}</div>
              ) : null}
            </div>
          </div>

          <div className="card" style={{ padding: 24, marginTop: 20 }}>
            <div className="panel-section-title">{t("dash.activity.prizePool.title")}</div>
            <p className="comp-card-desc" style={{ marginBottom: 16 }}>
              {t("dash.activities.prizeText")}
            </p>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("dash.activity.prizePool.rank")}</th>
                    <th>{t("dash.activity.prizePool.reward")}</th>
                  </tr>
                </thead>
                <tbody>
                  {PRIZE_TIERS.map((tier) => (
                    <tr key={tier.rankKey}>
                      <td>#{tier.rankKey}</td>
                      <td style={{ color: "var(--green)", fontWeight: 700 }}>${tier.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="drawer-row" style={{ marginTop: 4 }}>
              <span className="k">{t("dash.activity.prizePool.total")}</span>
              <span className="v">${PRIZE_POOL.toFixed(2)}</span>
            </div>
          </div>

          <div className="card" style={{ padding: 24, marginTop: 20 }}>
            <div className="panel-section-title">{t("dash.activity.ranking.title")}</div>
            <p className="comp-card-desc">{t("dash.activity.ranking.body")}</p>
          </div>
        </div>

        <div className="profile-col-side">
          <div className="card" style={{ padding: 24 }}>
            <div className="panel-section-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {t("dash.activity.leaderboard.title")}
              <Link href="/dashboard/leaderboard" className="comp-rules-link">
                {t("dash.activities.leaderboard")}
              </Link>
            </div>
            {leaderboardRows.length === 0 ? (
              <p className="comp-card-desc">{t("dash.activity.leaderboard.empty")}</p>
            ) : (
              <>
                <div className="activity-lb is-compact">
                  <div className="activity-lb-row is-head">
                    <span>{t("dash.leaderboard.colPlace")}</span>
                    <span>{t("dash.leaderboard.colUsername")}</span>
                    <span>{t("dash.activity.prizePool.reward")}</span>
                  </div>
                  {lbPageRows.map((row) => {
                    const m = row.memberId != null ? members.find((mm) => mm.id === row.memberId) : undefined;
                    const name = m?.name ?? t("dash.activity.leaderboard.anonTrader", { rank: row.rank });
                    const prize = prizeForRank(row.rank);
                    return (
                      <div className="activity-lb-row" key={row.rank}>
                        <span className="activity-lb-place">#{row.rank}</span>
                        <span className="activity-lb-member">
                          <span className="activity-lb-avatar">
                            {/* eslint-disable-next-line @next/next/no-img-element -- static export, small local demo avatar */}
                            <img src={avatarFor(row.memberId ?? row.rank)} alt={name} />
                          </span>
                          <span className="activity-lb-info">
                            <span className="activity-lb-name">{name}</span>
                            {m?.country && <span className="activity-lb-country">{m.country}</span>}
                          </span>
                        </span>
                        <span style={{ color: prize ? "var(--green)" : "var(--text-sub)", fontWeight: prize ? 700 : 400 }}>
                          {prize ? `$${prize.toFixed(2)}` : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {leaderboardRows.length > LB_PAGE_SIZE && (
                  <div className="activity-lb-pagination">
                    <button
                      type="button"
                      className="journal-cal-btn"
                      disabled={lbPage === 1}
                      onClick={() => setLbPage((p) => Math.max(1, p - 1))}
                      aria-label={t("dash.activity.leaderboard.prevPage")}
                    >
                      <Icon name="chevron_left" />
                    </button>
                    <span className="activity-lb-page-label">{t("dash.activity.leaderboard.page", { page: lbPage, total: lbTotalPages })}</span>
                    <button
                      type="button"
                      className="journal-cal-btn"
                      disabled={lbPage === lbTotalPages}
                      onClick={() => setLbPage((p) => Math.min(lbTotalPages, p + 1))}
                      aria-label={t("dash.activity.leaderboard.nextPage")}
                    >
                      <Icon name="chevron_right" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div className="panel-section-title">{t("dash.activity.rules.title")}</div>
            <ul className="activity-rules-list">
              {RULE_KEYS.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
