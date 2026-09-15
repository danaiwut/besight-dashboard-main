"use client";

import { useMemo } from "react";
import {
  useCrm,
  memberLifetimeStats,
  memberTradeAccounts,
  memberIndicatorAccess,
  memberLots,
  memberRebate,
  requiredLotsFor,
  accountLots,
  accountRebate,
  CURRENT_MEMBER_ID,
  type Member,
  type Broker,
  type TradeAccount,
  type DateRange,
} from "../crm/CrmContext";

export type LeaderboardRow = { rank: number; member: Member; lots: number; rebate: number };
export type AccountRow = { account: TradeAccount; broker: Broker | undefined; lots: number; rebate: number };
export type HistoryRow = { id: number; tradeDate: string; symbol: string; lots: number; rebate: number; brokerName: string };

// accountLots/accountRebate default to "this calendar month" when no range
// is given — passing this wide range instead gets their all-time total.
const ALL_TIME: DateRange = { from: "2000-01-01", to: "2999-12-31" };

/** Everything the customer-facing dashboard (app/dashboard) needs, scoped to
 *  the one member it's demoed as (see CURRENT_MEMBER_ID) — trade accounts,
 *  lifetime totals, a wallet-style settled/pending split, transaction
 *  history and standing on the all-member leaderboard. Built entirely on
 *  top of the existing CrmContext mock data so the admin CRM and the
 *  customer dashboard stay a single source of truth. */
export function useCustomerData() {
  const { members, tradeAccounts, tradeLogs, brokers, settings, indicatorAccess, indicators } = useCrm();

  const member = members.find((m) => m.id === CURRENT_MEMBER_ID) ?? members[0];
  const accounts = memberTradeAccounts(member.id, tradeAccounts);
  const accountIds = useMemo(() => new Set(accounts.map((a) => a.id)), [accounts]);
  const verifiedCount = accounts.filter((a) => a.verification === "verified").length;
  const activeIndicatorCount = memberIndicatorAccess(member.id, indicatorAccess).filter((a) => a.status === "active").length;
  const totalIndicatorCount = indicators.length;
  const indicatorAccessPct = totalIndicatorCount > 0 ? Math.min(100, Math.round((activeIndicatorCount / totalIndicatorCount) * 100)) : 0;

  const thisMonthLots = memberLots(member, tradeAccounts, tradeLogs, settings);
  const thisMonthRebate = memberRebate(member, tradeAccounts, tradeLogs, settings);
  const requiredLots = requiredLotsFor(member, settings);
  const goalPct = requiredLots > 0 ? Math.min(100, Math.round((thisMonthLots / requiredLots) * 100)) : 0;

  const accountsWithStats: AccountRow[] = useMemo(
    () =>
      accounts.map((account) => ({
        account,
        broker: brokers.find((b) => b.id === account.brokerId),
        lots: accountLots(account.id, tradeLogs, ALL_TIME),
        rebate: accountRebate(account.id, tradeLogs, ALL_TIME),
      })),
    [accounts, brokers, tradeLogs]
  );

  const myLogs = useMemo(
    () => tradeLogs.filter((l) => l.memberId === member.id && accountIds.has(l.tradeAccountId)),
    [tradeLogs, member.id, accountIds]
  );

  const { lots: totalLots, rebate: totalRebate } = memberLifetimeStats(member.id, tradeLogs);

  // Demo payout model: rebate earned on or before the 15th of the trade
  // month is already settled to the broker wallet; anything after that is
  // this cycle's pending balance — mirrors a twice-monthly IB payout run.
  const transferred = myLogs.filter((l) => Number(l.tradeDate.slice(-2)) <= 15).reduce((s, l) => s + l.rebate, 0);
  const pending = Math.max(0, Math.round((totalRebate - transferred) * 100) / 100);

  const history: HistoryRow[] = useMemo(() => {
    const brokerNameOf = (tradeAccountId: number) => {
      const account = accounts.find((a) => a.id === tradeAccountId);
      return (account && brokers.find((b) => b.id === account.brokerId)?.name) ?? "—";
    };
    return [...myLogs]
      .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate))
      .map((l) => ({ id: l.id, tradeDate: l.tradeDate, symbol: l.symbol, lots: l.lots, rebate: l.rebate, brokerName: brokerNameOf(l.tradeAccountId) }));
  }, [myLogs, accounts, brokers]);

  const leaderboard: LeaderboardRow[] = useMemo(() => {
    return members
      .map((m) => ({ member: m, ...memberLifetimeStats(m.id, tradeLogs) }))
      .filter((row) => row.rebate > 0)
      .sort((a, b) => b.rebate - a.rebate)
      .map((row, i) => ({ rank: i + 1, member: row.member, lots: row.lots, rebate: row.rebate }));
  }, [members, tradeLogs]);

  const myRank = leaderboard.find((row) => row.member.id === member.id)?.rank ?? leaderboard.length;

  function brokerFor(account: TradeAccount) {
    return brokers.find((b) => b.id === account.brokerId);
  }

  return {
    member,
    accounts,
    accountsWithStats,
    brokerFor,
    totalLots,
    totalRebate,
    transferred,
    pending,
    history,
    leaderboard,
    myRank,
    verifiedCount,
    activeIndicatorCount,
    totalIndicatorCount,
    indicatorAccessPct,
    thisMonthLots,
    thisMonthRebate,
    requiredLots,
    goalPct,
  };
}
