"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLanguage } from "../../components/crm/LanguageContext";
import { fmtDate, lot, useCrm, accountLots, accountRebate, type DateRange, type TradeAccount } from "../../components/crm/CrmContext";
import { apiCall } from "../../lib/crmApi";
import { useCustomerData } from "../../components/dashboard/useCustomerData";
import DateRangePicker from "../../components/crm/DateRangePicker";
import TradeIdInline from "../../components/dashboard/TradeIdInline";
import OpenAccountButton from "../../components/dashboard/OpenAccountButton";
import IdentityVerifyCard from "../../components/dashboard/IdentityVerifyCard";
import WalletGlow from "../../components/dashboard/WalletGlow";
import { useTheme } from "../../components/dashboard/ThemeContext";
import Icon from "../../components/Icon";

const HISTORY_RANGES = ["all", "30", "90", "180"] as const;
type HistoryRange = (typeof HISTORY_RANGES)[number];

// accountLots/accountRebate default to "this calendar month" when no range
// is given — passing this wide range instead gets their all-time total.
const ALL_TIME: DateRange = { from: "2000-01-01", to: "2999-12-31" };

function rankClass(rank: number) {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "";
}

export default function DashboardOverviewPage() {
  const { t } = useLanguage();
  const {
    member,
    accounts,
    brokerFor,
    accountsWithStats,
    totalLots,
    totalRebate,
    pending,
    history,
    leaderboard,
    myRank,
    verifiedCount,
    activeIndicatorCount,
    totalIndicatorCount,
    thisMonthRebate,
    requiredLots,
    goalPct,
  } = useCustomerData();
  const { tradeLogs, setTradeAccounts, pendingTradeAccounts, setPendingTradeAccounts, identity, toast } = useCrm();
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("all");
  const [accountsRange, setAccountsRange] = useState({ from: "", to: "" });
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const historyListRef = useRef<HTMLDivElement>(null);

  /** Confirm a CRM-synced account is the member's — claims it into the visible
   *  list (the row was hidden until now). */
  async function confirmAccount(account: TradeAccount) {
    if (!identity) {
      toast(t("dash.identity.required"));
      return;
    }
    setConfirmingId(account.id);
    try {
      const payload = await apiCall<{ tradeAccount: TradeAccount }>("/api/me/trade-accounts/", "POST", {
        tradeId: account.tradeId,
        ...identity,
      });
      setPendingTradeAccounts((cur) => cur.filter((a) => a.id !== account.id));
      setTradeAccounts((cur) => (cur.some((a) => a.id === payload.tradeAccount.id) ? cur : [payload.tradeAccount, ...cur]));
      toast(t("dash.accounts.pendingDone", { tradeId: account.tradeId }));
    } catch (error) {
      toast(error instanceof Error ? error.message : t("dash.accounts.pendingFailed"));
    } finally {
      setConfirmingId(null);
    }
  }

  async function removeAccount(account: TradeAccount) {
    if (!window.confirm(t("dash.accounts.removeConfirm", { tradeId: account.tradeId }))) return;
    setRemovingId(account.id);
    try {
      await apiCall(`/api/me/trade-accounts/${account.id}/`, "DELETE");
      setTradeAccounts((cur) => cur.filter((a) => a.id !== account.id));
      toast(t("dash.accounts.removeDone", { tradeId: account.tradeId }));
    } catch (error) {
      toast(error instanceof Error ? error.message : t("dash.accounts.removeFailed"));
    } finally {
      setRemovingId(null);
    }
  }

  function scrollHistory(dir: 1 | -1) {
    historyListRef.current?.scrollBy({ top: dir * 168, behavior: "smooth" });
  }
  const pendingCount = accountsWithStats.length - verifiedCount;

  const filteredHistory = useMemo(() => {
    if (historyRange === "all" || !history.length) return history;
    // history is sorted newest-first, so its own latest entry is the
    // reference point — keeps this pure (no Date.now() during render) and
    // makes "last 30 days" mean relative to the data, not the real clock.
    const latest = new Date(history[0].tradeDate).getTime();
    const cutoff = new Date(latest - Number(historyRange) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return history.filter((h) => h.tradeDate >= cutoff);
  }, [history, historyRange]);

  const accountsDateRange = useMemo<DateRange>(
    () => (accountsRange.from || accountsRange.to ? accountsRange : ALL_TIME),
    [accountsRange]
  );

  const filteredAccountsWithStats = useMemo(
    () =>
      accounts.map((account) => ({
        account,
        broker: brokerFor(account),
        lots: accountLots(account.id, tradeLogs, accountsDateRange),
        rebate: accountRebate(account.id, tradeLogs, accountsDateRange),
      })),
    [accounts, brokerFor, tradeLogs, accountsDateRange]
  );

  function copyCode() {
    navigator.clipboard
      ?.writeText(member.code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  const updatedFrom = history.length ? fmtDate(history[history.length - 1].tradeDate) : "—";
  const updatedTo = history.length ? fmtDate(history[0].tradeDate) : "—";
  const top5 = leaderboard.slice(0, 5);

  return (
    <>
      <div className="dash-grid-top">
        {/* ── Wallet card ── */}
        <div className="wallet-card">
          <WalletGlow />
          <div className="wallet-card-top">
            <div className="wallet-rank">
              <div className="n">{myRank}</div>
              <div className="l">RANK</div>
            </div>
            <div className="wallet-code">
              <span className="code-text">{member.code}</span>
              <button onClick={copyCode} aria-label={t("dash.wallet.copyCode")} title={copied ? t("dash.wallet.copied") : t("dash.wallet.copyCode")}>
                <Icon name={copied ? "check" : "content_copy"} />
              </button>
            </div>
            <div className="wallet-brand">
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative logo mark, sized by CSS */}
              <img src={theme === "dark" ? "/img/Horizontal-logo-w.png" : "/img/Horizontal-logo-c.png"} alt="BeSight" />
            </div>
          </div>

          <div className="wallet-balance-label">{t("dash.wallet.balance")}</div>
          <div className="wallet-balance-value">${pending.toFixed(2)}</div>
          <div className="wallet-lots">{t("dash.wallet.lotsTraded", { lots: lot(totalLots) })}</div>

          <div className="wallet-substats">
            <div className="wallet-substat">
              <span className="sw-ic">
                <Icon name="task_alt" />
              </span>
              <div>
                <div className="v">${totalRebate.toFixed(2)}</div>
                <div className="l">{t("dash.wallet.totalEarned")}</div>
              </div>
            </div>
          </div>

          <div className="wallet-updated">{t("dash.wallet.updated", { from: updatedFrom, to: updatedTo })}</div>
        </div>

        {/* ── Trade accounts ── */}
        <div className="card accounts-card">
          <div className="accounts-card-head">
            <h2>{t("dash.accounts.title")}</h2>
            <DateRangePicker value={accountsRange} onChange={setAccountsRange} placeholder={t("dash.history.filter.label")} />
          </div>
          <IdentityVerifyCard />
          {pendingTradeAccounts.length > 0 && (
            <div style={{ margin: "0 0 14px", padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-card2, rgba(0,0,0,0.03))" }}>
              <div className="panel-section-title" style={{ marginBottom: 4 }}>{t("dash.accounts.pendingTitle")}</div>
              <p style={{ fontSize: 12.5, color: "var(--text-sub)", marginBottom: 10 }}>{t("dash.accounts.pendingHint")}</p>
              {pendingTradeAccounts.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                  <span className="mono">{a.tradeId}</span>
                  <button
                    className="btn btn-primary"
                    style={{ padding: "6px 14px" }}
                    disabled={confirmingId === a.id || !identity}
                    title={identity ? undefined : t("dash.identity.required")}
                    onClick={() => void confirmAccount(a)}
                  >
                    {t("dash.accounts.pendingConfirm")}
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("dash.accounts.col.number")}</th>
                  <th>{t("dash.accounts.col.broker")}</th>
                  <th>{t("dash.accounts.col.type")}</th>
                  <th>{t("dash.accounts.col.lots")}</th>
                  <th>{t("dash.accounts.col.rebate")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredAccountsWithStats.length ? (
                  filteredAccountsWithStats.map(({ account, broker, lots, rebate }) => (
                    <tr key={account.id}>
                      <td className="mono">{account.tradeId}</td>
                      <td>{broker?.name ?? "—"}</td>
                      <td>{account.accountType}</td>
                      <td>{lot(lots)}</td>
                      <td style={{ color: "var(--green)", fontWeight: 600 }}>${rebate.toFixed(2)}</td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="kebab"
                          aria-label={t("dash.accounts.remove")}
                          disabled={removingId === account.id}
                          onClick={() => void removeAccount(account)}
                        >
                          <Icon name="delete" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      {t("dash.accounts.empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="accounts-actions">
            <OpenAccountButton />
            <button className="btn btn-ghost">{t("dash.accounts.xmWallet")}</button>
            <div className="accounts-break" aria-hidden="true" />
            <TradeIdInline />
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card stat-card-rebate">
          <div className="value">${thisMonthRebate.toFixed(2)}</div>
          <div className="label">{t("dash.stat.rebateThisMonth")}</div>
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative deco graphic, sized/cropped by CSS */}
          <img className="stat-card-deco" src="/img/dashboard-ui/coin-rebate.png" alt="" aria-hidden="true" />
        </div>

        <div className="stat-card stat-card-indicator">
          <div className="value">
            {activeIndicatorCount}
            <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-sub)", marginLeft: 4 }}>/ {totalIndicatorCount}</span>
          </div>
          <div className="label">{t("dash.stat.indicatorAccess")}</div>
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative deco graphic, sized/cropped by CSS */}
          <img className="stat-card-deco" src="/img/dashboard-ui/indicator-a.png" alt="" aria-hidden="true" />
        </div>

        <div className="stat-card stat-card-goal">
          <div className="value">{goalPct}%</div>
          <div className="label">{t("dash.stat.monthlyLotGoal")}</div>
          <div className="stat-subnote">{t("dash.stat.goalNote", { required: lot(requiredLots) })}</div>
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative deco graphic, sized/cropped by CSS */}
          <img className="stat-card-deco" src="/img/dashboard-ui/grow-m.png" alt="" aria-hidden="true" />
        </div>

        <div className="stat-card stat-card-accounts">
          <div className="top">
            <span className="stat-trend" style={{ color: pendingCount ? "var(--amber)" : "var(--green)" }}>
              {pendingCount ? t("dash.stat.pending", { n: pendingCount }) : t("dash.stat.allVerified")}
            </span>
          </div>
          <div className="value">{accountsWithStats.length}</div>
          <div className="label">{t("dash.stat.tradeAccounts")}</div>
          <div className="stat-subnote">{t("dash.stat.verifiedNote", { n: verifiedCount })}</div>
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative deco graphic, sized/cropped by CSS */}
          <img className="stat-card-deco" src="/img/dashboard-ui/t-account.png" alt="" aria-hidden="true" />
        </div>
      </div>

      <div className="dash-grid-bottom">
        {/* ── History ── */}
        <div className="card history-card" style={{ padding: 20 }}>
          <div className="panel-section-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {t("dash.history.title")}
            <select
              className="filter-select"
              value={historyRange}
              onChange={(e) => setHistoryRange(e.target.value as HistoryRange)}
              aria-label={t("dash.history.filter.label")}
            >
              {HISTORY_RANGES.map((r) => (
                <option key={r} value={r}>
                  {t(`dash.history.filter.${r}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="history-list" ref={historyListRef}>
            {filteredHistory.length ? (
              filteredHistory.slice(0, 8).map((h) => (
                <div className="history-item" key={h.id}>
                  <span className="history-ic">
                    <Icon name="send_money" />
                  </span>
                  <div className="history-body">
                    <div className="history-title">{t("dash.history.item", { broker: h.brokerName })}</div>
                    <div className="history-time">{fmtDate(h.tradeDate)}</div>
                  </div>
                  <div className="history-amount">+${h.rebate.toFixed(2)}</div>
                </div>
              ))
            ) : (
              <div className="table-empty">{t("dash.history.empty")}</div>
            )}
          </div>
          {filteredHistory.length > 3 && (
            <div className="history-scroll-controls">
              <button type="button" className="history-scroll-btn" aria-label="Scroll up" onClick={() => scrollHistory(-1)}>
                <Icon name="expand_less" />
              </button>
              <button type="button" className="history-scroll-btn" aria-label="Scroll down" onClick={() => scrollHistory(1)}>
                <Icon name="expand_more" />
              </button>
            </div>
          )}
        </div>

        {/* ── Leaderboard ── */}
        <div className="card" style={{ padding: 20 }}>
          <div className="panel-section-title">{t("dash.leaderboard.title")}</div>
          <div className="lb-list">
            {top5.length ? (
              top5.map((row) => (
                <div className={`lb-item${row.member.id === member.id ? " is-you" : ""}`} key={row.member.id}>
                  <span className={`lb-rank ${rankClass(row.rank)}`}>{row.rank}</span>
                  <div>
                    <div className="lb-name">
                      {row.member.id === member.id ? `${row.member.name} · ${t("dash.leaderboard.you")}` : row.member.name}
                    </div>
                    <div className="lb-code">{row.member.code}</div>
                  </div>
                  <div className="lb-amount">
                    <div className="v">${row.rebate.toFixed(2)}</div>
                    <div className="l">
                      {lot(row.lots)} {t("dash.leaderboard.lotsSuffix")}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="table-empty">{t("dash.leaderboard.empty")}</div>
            )}
          </div>
          <div style={{ marginTop: 14, textAlign: "right" }}>
            <Link href="/dashboard/leaderboard" className="btn btn-ghost" style={{ display: "inline-flex" }}>
              {t("dash.leaderboard.viewAll")}
              <Icon name="arrow_forward" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
