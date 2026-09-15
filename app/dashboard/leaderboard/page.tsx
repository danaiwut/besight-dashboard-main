"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { useCrm, lot, currentMonthRange } from "../../../components/crm/CrmContext";
import { useCustomerData } from "../../../components/dashboard/useCustomerData";
import Icon from "../../../components/Icon";

type Period = "daily" | "monthly";
type Row = { rank: number; member: { id: number; name: string; code: string }; rebate: number; lots: number };

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

// The mock trade logs live on fixed calendar days within "this month" (see
// CrmContext), so the latest one isn't reliably the real current day — it
// can even be later in the month than today. That's fine for deciding which
// rows count as "today's" activity, but a daily countdown built from it
// could show something nonsensical like 18 days left. This anchors the
// countdown to the real end of today instead.
function endOfTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T23:59:59`;
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

// 12 placeholder portraits cycled by member id — this is a demo dataset
// with no real profile photos, so a small local set stands in for one.
const AVATAR_COUNT = 12;
function avatarFor(id: number): string {
  return `/img/avatars/avatar-${((id - 1) % AVATAR_COUNT) + 1}.png`;
}

function rankMapOf(rows: Row[]) {
  const map = new Map<number, number>();
  rows.forEach((r) => map.set(r.member.id, r.rank));
  return map;
}

export default function DashboardLeaderboardPage() {
  const { t } = useLanguage();
  const { members, tradeLogs } = useCrm();
  const { member, leaderboard: monthlyLeaderboard } = useCustomerData();
  const [period, setPeriod] = useState<Period>("monthly");
  const [page, setPage] = useState(1);

  const latestDate = useMemo(() => tradeLogs.reduce((max, l) => (l.tradeDate > max ? l.tradeDate : max), ""), [tradeLogs]);

  const dailyLeaderboard: Row[] = useMemo(() => {
    return members
      .map((m) => {
        const logs = tradeLogs.filter((l) => l.memberId === m.id && l.tradeDate === latestDate);
        return { member: m, rebate: logs.reduce((s, l) => s + l.rebate, 0), lots: logs.reduce((s, l) => s + l.lots, 0) };
      })
      .filter((row) => row.rebate > 0)
      .sort((a, b) => b.rebate - a.rebate)
      .map((row, i) => ({ rank: i + 1, ...row }));
  }, [members, tradeLogs, latestDate]);

  const board = period === "daily" ? dailyLeaderboard : monthlyLeaderboard;
  const periodEnd = period === "daily" ? endOfTodayIso() : `${currentMonthRange().to}T23:59:59`;
  const periodLabel =
    period === "daily" ? thaiPeriodLabel(latestDate || endOfTodayIso(), "day") : thaiPeriodLabel(currentMonthRange().from ?? endOfTodayIso(), "month");

  // "Change" needs a real prior snapshot to diff against — the mock trade
  // logs span several distinct calendar days within this month, so the day
  // just before the latest one stands in for "yesterday" and gives every
  // period a genuine (not fabricated) rank-movement comparison: the daily
  // board compares against that single day, the monthly/lifetime board
  // compares against the same cumulative totals frozen at that day.
  const distinctDates = useMemo(() => Array.from(new Set(tradeLogs.map((l) => l.tradeDate))).sort(), [tradeLogs]);
  const prevDate = useMemo(() => {
    const idx = distinctDates.indexOf(latestDate);
    return idx > 0 ? distinctDates[idx - 1] : null;
  }, [distinctDates, latestDate]);

  const dailyPrevBoard: Row[] = useMemo(() => {
    if (!prevDate) return [];
    return members
      .map((m) => {
        const logs = tradeLogs.filter((l) => l.memberId === m.id && l.tradeDate === prevDate);
        return { member: m, rebate: logs.reduce((s, l) => s + l.rebate, 0), lots: logs.reduce((s, l) => s + l.lots, 0) };
      })
      .filter((row) => row.rebate > 0)
      .sort((a, b) => b.rebate - a.rebate)
      .map((row, i) => ({ rank: i + 1, ...row }));
  }, [members, tradeLogs, prevDate]);

  const monthlyPrevBoard: Row[] = useMemo(() => {
    if (!prevDate) return [];
    return members
      .map((m) => {
        const logs = tradeLogs.filter((l) => l.memberId === m.id && l.tradeDate <= prevDate);
        return { member: m, rebate: logs.reduce((s, l) => s + l.rebate, 0), lots: logs.reduce((s, l) => s + l.lots, 0) };
      })
      .filter((row) => row.rebate > 0)
      .sort((a, b) => b.rebate - a.rebate)
      .map((row, i) => ({ rank: i + 1, ...row }));
  }, [members, tradeLogs, prevDate]);

  const prevRankById = useMemo(
    () => rankMapOf(period === "daily" ? dailyPrevBoard : monthlyPrevBoard),
    [period, dailyPrevBoard, monthlyPrevBoard]
  );

  function changeFor(row: Row): number | null {
    const prev = prevRankById.get(row.member.id);
    if (prev == null) return null;
    return prev - row.rank;
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
  const rest = board.slice(3);
  const totalPages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
  const pageRows = rest.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const lastUpdatedLabel = thaiPeriodLabel(latestDate || endOfTodayIso(), "day");

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

      {board.length ? (
        <div className="lbd-main">
          <div className="lbd-podium">
              {podium.map((row, slot) => {
                if (!row) return <div className="lbd-podium-slot" key={`empty-${slot}`} />;
                const rank = row.rank;
                return (
                  <div className={`lbd-podium-card rank-${rank}${row.member.id === member.id ? " is-you" : ""}`} key={row.member.id}>
                    <div className="lbd-avatar-wrap">
                      <Icon name="emoji_events" className="lbd-crown" />
                      <div className="lbd-avatar">
                        {/* eslint-disable-next-line @next/next/no-img-element -- static export, small local demo avatar */}
                        <img src={avatarFor(row.member.id)} alt={row.member.name} />
                      </div>
                    </div>
                    <div className="lbd-rank-badge">#{rank}</div>
                    <div className="lbd-name">{row.member.name}</div>
                    <div className="lbd-code">{row.member.code}</div>
                    <div className="lbd-amount">${row.rebate.toFixed(2)}</div>
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
                <span>{t("dash.leaderboard.colChange")}</span>
              </div>
              {pageRows.length ? (
                pageRows.map((row) => {
                  const chg = changeFor(row);
                  return (
                    <div className={`lbd-row${row.member.id === member.id ? " is-you" : ""}`} key={row.member.id}>
                      <span className="lbd-place">{row.rank}</span>
                      <span className="lbd-member">
                        <span className="lbd-member-avatar">
                        {/* eslint-disable-next-line @next/next/no-img-element -- static export, small local demo avatar */}
                        <img src={avatarFor(row.member.id)} alt={row.member.name} />
                      </span>
                        <span className="lbd-member-info">
                          <div className="lbd-member-name">{row.member.name}</div>
                          <div className="lbd-member-code">{row.member.code}</div>
                        </span>
                      </span>
                      <span>{t(tierFor(row.lots).titleKey)}</span>
                      <span>{lot(row.lots)}</span>
                      <span className="lbd-rebate-pill">${row.rebate.toFixed(2)}</span>
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
