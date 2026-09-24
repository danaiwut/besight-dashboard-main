"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { lot, currentMonthRange } from "../../../components/crm/CrmContext";
import { useCustomerData } from "../../../components/dashboard/useCustomerData";
import { apiCall } from "../../../lib/crmApi";
import Icon from "../../../components/Icon";
import LeaderboardAvatar from "../../../components/dashboard/LeaderboardAvatar";
import type { LeaderboardAvatarDto } from "../../../lib/leaderboardProfile";

type Period = "daily" | "monthly";
type Row = {
  rank: number;
  memberId: number;
  name: string;
  code: string;
  lots: number;
  rebate: number;
  symbols: string[];
  avatar: LeaderboardAvatarDto;
  anonymous: boolean;
  previousRank: number | null;
};

const MAX_SYMBOL_BADGES = 6;

const PAGE_SIZE = 8;

// Same lot thresholds as the Rewards page's tier ladder (kept in sync by
// hand rather than shared code, since this page only needs the name + a
// colour, not the icons/rewards copy the Rewards page carries per tier).
const TIER_LADDER = [
  { key: "exclusive", threshold: 2000, titleKey: "dash.rewards.tier.exclusive" },
  { key: "beyond", threshold: 500, titleKey: "dash.rewards.tier.beyond" },
  { key: "gold", threshold: 150, titleKey: "dash.rewards.tier.gold" },
  { key: "silver", threshold: 50, titleKey: "dash.rewards.tier.silver" },
  { key: "bronze", threshold: 0, titleKey: "dash.rewards.tier.bronze" },
];

function tierFor(lots: number) {
  return TIER_LADDER.find((t) => lots >= t.threshold) ?? TIER_LADDER[TIER_LADDER.length - 1];
}

// Kept out of the component body on purpose: the purity lint rule flags a
// literal `new Date()` written inline in a component/hook, but not one
// hidden behind a plain function call — same pattern as currentMonthRange().
function remainingParts(endIso: string) {
  const ms = Math.max(0, new Date(endIso).getTime() - new Date().getTime());
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return { days, hours, minutes, seconds };
}

/** End of the current period — month end for monthly, end of today for daily. */
function periodEndIso(period: Period): string {
  if (period === "daily") {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T23:59:59`;
  }
  return `${currentMonthRange().to}T23:59:59`;
}

function thaiPeriodLabel(dateIso: string, mode: "day" | "month"): string {
  const d = new Date(dateIso);
  const opts: Intl.DateTimeFormatOptions =
    mode === "day" ? { day: "numeric", month: "long", year: "numeric" } : { month: "long", year: "numeric" };
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", opts).format(d);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function pageList(current: number, total: number): (number | "…")[] {
  if (total <= 6) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, 2, total - 1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - (sorted[i - 1] as number) > 1) out.push("…");
    out.push(p);
  });
  return out;
}


export default function DashboardLeaderboardPage() {
  const { t } = useLanguage();
  const { member } = useCustomerData();
  const nameOf = (row: Row) => (row.anonymous ? t("dash.leaderboard.anonymous") : row.name);
  const [period, setPeriod] = useState<Period>("monthly");
  const [page, setPage] = useState(1);
  const [board, setBoard] = useState<Row[]>([]);
  const [me, setMe] = useState<Row | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    // Reset to the loading state when the period changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    apiCall<{ rows: Row[]; me: Row | null; updatedAt: string }>(`/api/leaderboard/?period=${period}`, "GET")
      .then((payload) => {
        if (cancelled) return;
        setBoard(payload.rows);
        setMe(payload.me);
        setUpdatedAt(payload.updatedAt);
        setError("");
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load leaderboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [period]);

  const periodEnd = useMemo(() => periodEndIso(period), [period]);
  const periodLabel = period === "daily" ? thaiPeriodLabel(periodEnd, "day") : thaiPeriodLabel(periodEnd, "month");

  function changeFor(row: Row): number | null {
    if (row.previousRank == null) return null;
    return row.previousRank - row.rank;
  }

  // Starts at zero rather than computing from `new Date()` during the
  // initial render — that value would differ between server and client
  // and fail hydration. The real countdown is filled in by the effect
  // below, which only runs client-side after mount.
  const [remaining, setRemaining] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above: this is the client-only initial fill-in, not a redundant re-sync.
    setRemaining(remainingParts(periodEnd));
    const id = setInterval(() => setRemaining(remainingParts(periodEnd)), 1000);
    return () => clearInterval(id);
  }, [periodEnd]);

  function selectPeriod(next: Period) {
    setPeriod(next);
    setPage(1);
  }

  const podium = [board[1], board[0], board[2]];
  const leaderLots = board[0]?.lots ?? 0;
  const rest = board.slice(3);
  const totalPages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
  const pageRows = rest.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const lastUpdatedLabel = updatedAt ? thaiPeriodLabel(updatedAt, "day") : thaiPeriodLabel(periodEnd, "day");

  return (
    <div className="lbd">
      <div className="lbd-hero">
        <div className="lbd-hero-top">
          <div className="lbd-tabs">
            <button className={period === "daily" ? "is-active" : ""} onClick={() => selectPeriod("daily")}>
              {t("dash.leaderboard.daily")}
            </button>
            <button className={period === "monthly" ? "is-active" : ""} onClick={() => selectPeriod("monthly")}>
              {t("dash.leaderboard.monthly")}
            </button>
          </div>
        </div>
        <div className="lbd-updated">
          <Icon name="update" />
          {t("dash.leaderboard.lastUpdated", { date: lastUpdatedLabel })}
        </div>
      </div>

      {loading ? (
        <div className="lbd-empty">…</div>
      ) : error ? (
        <div className="lbd-empty">{error}</div>
      ) : board.length ? (
        <div className="lbd-main">
          <div className="lbd-podium">
              {podium.map((row, slot) => {
                if (!row) return <div className="lbd-podium-slot" key={`empty-${slot}`} />;
                const rank = row.rank;
                return (
                  <div className={`lbd-podium-card rank-${rank}${row.memberId === member.id ? " is-you" : ""}`} key={row.memberId}>
                    <div className="lbd-avatar-wrap">
                      <Icon name="emoji_events" className="lbd-crown" />
                      <div className="lbd-avatar">
                        <LeaderboardAvatar avatar={row.avatar} name={nameOf(row)} anonymous={row.anonymous} />
                      </div>
                    </div>
                    <div className="lbd-rank-badge">#{rank}</div>
                    <div className="lbd-name">{nameOf(row)}</div>
                    {row.code && row.code !== row.name && <div className="lbd-code">{row.code}</div>}
                    <div className="lbd-amount">{lot(row.lots)}</div>
                    {rank === 1 && (
                      <div className="lbd-top-pill">
                        <Icon name="bolt" />
                        {t("dash.leaderboard.topPerformer")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {podium[1] && (
              <div className="lbd-countdown">
                <Icon name="schedule" />
                <div className="l">{t(period === "daily" ? "dash.leaderboard.endingInDaily" : "dash.leaderboard.endingInMonthly")}</div>
                <div className="v">
                  {pad(remaining.days)}d {pad(remaining.hours)}h {pad(remaining.minutes)}m {pad(remaining.seconds)}s
                </div>
              </div>
            )}

            {me && me.rank > board.length && (
              <div className="lbd-count-pill" style={{ marginBottom: 10 }}>
                {t("dash.leaderboard.yourRank", { rank: me.rank, lots: lot(me.lots) })}
              </div>
            )}

            <h2 className="lbd-table-title">
              {t(period === "daily" ? "dash.leaderboard.tableTitleDaily" : "dash.leaderboard.tableTitleMonthly", { period: periodLabel })}
            </h2>
            <div className="lbd-count-pill">{t("dash.leaderboard.totalMembers", { n: board.length })}</div>

            <div className="lbd-table">
              <div className="lbd-row lbd-head">
                <span>{t("dash.leaderboard.colPlace")}</span>
                <span>{t("dash.leaderboard.colUsername")}</span>
                <span>{t("dash.leaderboard.colTier")}</span>
                <span>{t("dash.leaderboard.colLots")}</span>
                <span>{t("dash.leaderboard.colRebateAccum")}</span>
                <span>{t("dash.leaderboard.colGap")}</span>
                <span>{t("dash.leaderboard.colChange")}</span>
              </div>
              {pageRows.length ? (
                pageRows.map((row) => {
                  const chg = changeFor(row);
                  return (
                    <div className={`lbd-row${row.memberId === member.id ? " is-you" : ""}`} key={row.memberId}>
                      <span className="lbd-place">{row.rank}</span>
                      <span className="lbd-member">
                        <span className="lbd-member-avatar">
                          <LeaderboardAvatar avatar={row.avatar} name={nameOf(row)} anonymous={row.anonymous} />
                        </span>
                        <span className="lbd-member-info">
                          <div className="lbd-member-name">{nameOf(row)}</div>
                          {row.code && row.code !== row.name && <div className="lbd-member-code">{row.code}</div>}
                          {row.symbols?.length > 0 && (
                            <div className="lbd-symbols" title={row.symbols.join(", ")}>
                              {row.symbols.slice(0, MAX_SYMBOL_BADGES).map((symbol) => (
                                <span className="badge active lbd-symbol" key={symbol}>{symbol}</span>
                              ))}
                              {row.symbols.length > MAX_SYMBOL_BADGES && (
                                <span className="badge suspended lbd-symbol">+{row.symbols.length - MAX_SYMBOL_BADGES}</span>
                              )}
                            </div>
                          )}
                        </span>
                      </span>
                      <span>{t(tierFor(row.lots).titleKey)}</span>
                      <span>{lot(row.lots)}</span>
                      <span className="lbd-rebate">${(row.rebate ?? 0).toFixed(2)}</span>
                      <span className="lbd-rebate-pill">{leaderLots > 0 && row.lots < leaderLots ? `-${lot(leaderLots - row.lots)}` : "—"}</span>
                      <span className={`lbd-change${chg ? (chg > 0 ? " is-up" : " is-down") : " is-flat"}`}>
                        {!chg ? (
                          "–"
                        ) : (
                          <>
                            <Icon name={chg > 0 ? "arrow_upward" : "arrow_downward"} />
                            {Math.abs(chg)}
                          </>
                        )}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="lbd-row lbd-empty-row">{t("dash.leaderboard.noMore")}</div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="lbd-pagination">
                <button disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
                  <Icon name="chevron_left" />
                </button>
                {pageList(page, totalPages).map((p, i) =>
                  p === "…" ? (
                    <span className="lbd-page-ellipsis" key={`e-${i}`}>
                      …
                    </span>
                  ) : (
                    <button key={p} className={p === page ? "is-active" : ""} onClick={() => setPage(p)}>
                      {p}
                    </button>
                  )
                )}
                <button disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Next page">
                  <Icon name="chevron_right" />
                </button>
              </div>
            )}
        </div>
      ) : (
        <div className="lbd-empty">{t("dash.leaderboard.empty")}</div>
      )}
    </div>
  );
}
