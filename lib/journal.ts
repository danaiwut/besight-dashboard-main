/** Self-contained demo dataset for the Trading Journal page — a richer
 *  per-trade shape (entry/exit price, P&L, TP/SL) than the rebate-only
 *  TradeLog model the rest of the dashboard uses, since none of that data
 *  captures win/loss outcomes. Kept local to this feature rather than
 *  bolted onto the shared CrmContext trade logs. */

export type JournalTrade = {
  id: number;
  symbol: string;
  side: "buy" | "sell";
  openDate: string; // ISO datetime
  closeDate: string; // ISO datetime
  openPrice: number;
  closePrice: number;
  tp: number | null;
  sl: number | null;
  lots: number;
  pnl: number;
};

/** A single linked trading account — a member can hold several (e.g. one
 *  per broker or sub-account), each with its own trade history. */
export type JournalAccount = {
  id: string;
  createdDate: string;
  broker: string;
  accountType: string;
  platform: string;
  size: number;
  startDate: string;
  trades: JournalTrade[];
};

/** Journal accounts are per-member and not persisted yet — the feature reads
 *  nothing from here until a JournalEntry store exists, so this starts empty
 *  (no fabricated demo accounts/trades). */
export const INITIAL_ACCOUNTS: JournalAccount[] = [];

/** Trade technique/strategy tags a member can attach to a journal note —
 *  common trading concepts plus BeSight's own named strategies. */
export const TRADE_TAGS = ["SMC", "ICT", "CRT", "BeSight ONE", "BeSight Orca"];

export function tradeDurationMs(trade: JournalTrade) {
  return new Date(trade.closeDate).getTime() - new Date(trade.openDate).getTime();
}

export function fmtDuration(ms: number) {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function journalStats(trades: JournalTrade[]) {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const totalLots = trades.reduce((s, t) => s + t.lots, 0);
  const biggest = trades.reduce((acc, t) => ({ win: Math.max(acc.win, t.pnl), loss: Math.min(acc.loss, t.pnl) }), { win: 0, loss: 0 });
  const days = new Set(trades.map((t) => t.openDate.slice(0, 10))).size;

  const buys = trades.filter((t) => t.side === "buy");
  const sells = trades.filter((t) => t.side === "sell");
  const sideStats = (rows: JournalTrade[]) => {
    const w = rows.filter((t) => t.pnl > 0);
    const l = rows.filter((t) => t.pnl <= 0);
    return {
      profit: rows.reduce((s, t) => s + t.pnl, 0),
      wins: w.length,
      losses: l.length,
      winAmount: w.reduce((s, t) => s + t.pnl, 0),
      lossAmount: Math.abs(l.reduce((s, t) => s + t.pnl, 0)),
      winRate: rows.length ? Math.round((w.length / rows.length) * 1000) / 10 : 0,
    };
  };

  return {
    totalPnl,
    totalTrades: trades.length,
    totalLots: Math.round(totalLots * 100) / 100,
    winRate: trades.length ? Math.round((wins.length / trades.length) * 1000) / 10 : 0,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : 0,
    biggestWin: biggest.win,
    biggestLoss: biggest.loss,
    days,
    long: sideStats(buys),
    short: sideStats(sells),
  };
}

export function tradesByDay(trades: JournalTrade[]) {
  const map = new Map<string, { pnl: number; count: number }>();
  trades.forEach((t) => {
    const day = t.closeDate.slice(0, 10);
    const cur = map.get(day) ?? { pnl: 0, count: 0 };
    cur.pnl += t.pnl;
    cur.count += 1;
    map.set(day, cur);
  });
  return map;
}

/** Balance/equity walked forward trade-by-trade from a starting balance —
 *  used for both the account-balance line chart and the Score card's
 *  balance/equity summary. */
export function balanceSeries(trades: JournalTrade[], startBalance: number) {
  const sorted = [...trades].sort((a, b) => a.closeDate.localeCompare(b.closeDate));
  let running = startBalance;
  let max = startBalance;
  const points = sorted.map((t) => {
    running += t.pnl;
    max = Math.max(max, running);
    return { date: t.closeDate, balance: running };
  });
  return { points, max, current: running };
}
