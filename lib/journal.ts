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

export const INITIAL_ACCOUNTS: JournalAccount[] = [
  {
    id: "10947454",
    createdDate: "2025-11-05",
    broker: "XM",
    accountType: "Standard",
    platform: "MetaTrader 5",
    size: 5000,
    startDate: "2025-11-05",
    trades: [
      { id: 1, symbol: "XAUUSD", side: "sell", openDate: "2025-11-05T14:58:00", closeDate: "2025-11-05T15:06:00", openPrice: 3973.52, closePrice: 3965.92, tp: 3972.32, sl: 3984.36, lots: 0.02, pnl: 15.20 },
      { id: 2, symbol: "XAUUSD", side: "buy", openDate: "2025-11-05T16:25:00", closeDate: "2025-11-05T20:02:00", openPrice: 3967.48, closePrice: 3969.1, tp: 4000.0, sl: null, lots: 0.02, pnl: 3.24 },
      { id: 3, symbol: "XAUUSD", side: "buy", openDate: "2025-11-05T15:27:00", closeDate: "2025-11-05T20:02:00", openPrice: 3980.63, closePrice: 3971.38, tp: 4000.0, sl: null, lots: 0.02, pnl: -18.50 },
      { id: 4, symbol: "XAUUSD", side: "buy", openDate: "2025-11-05T16:21:00", closeDate: "2025-11-05T20:02:00", openPrice: 3971.81, closePrice: 3976.71, tp: 4000.0, sl: null, lots: 0.02, pnl: 9.80 },
      { id: 5, symbol: "XAUUSD", side: "buy", openDate: "2025-11-05T17:08:00", closeDate: "2025-11-05T20:02:00", openPrice: 3959.91, closePrice: 3969.1, tp: 4000.0, sl: null, lots: 0.02, pnl: 18.38 },
      { id: 6, symbol: "XAUUSD", side: "buy", openDate: "2025-11-05T16:14:00", closeDate: "2025-11-05T20:02:00", openPrice: 3975.97, closePrice: 3970.87, tp: 4000.0, sl: null, lots: 0.02, pnl: -10.20 },
      { id: 7, symbol: "XAUUSD", side: "buy", openDate: "2025-11-06T09:46:00", closeDate: "2025-11-06T11:24:00", openPrice: 3981.24, closePrice: 3986.32, tp: 4022.3, sl: null, lots: 0.02, pnl: 10.16 },
      { id: 8, symbol: "XAUUSD", side: "buy", openDate: "2025-11-06T12:25:00", closeDate: "2025-11-06T14:19:00", openPrice: 3989.67, closePrice: 3999.15, tp: null, sl: null, lots: 0.02, pnl: 18.96 },
      { id: 9, symbol: "XAUUSD", side: "buy", openDate: "2025-11-06T22:03:00", closeDate: "2025-11-07T00:21:00", openPrice: 3985.04, closePrice: 3977.34, tp: null, sl: null, lots: 0.02, pnl: -15.40 },
      { id: 10, symbol: "XAUUSD", side: "buy", openDate: "2025-11-06T21:21:00", closeDate: "2025-11-07T00:22:00", openPrice: 3998.43, closePrice: 4009.68, tp: null, sl: null, lots: 0.02, pnl: 22.50 },
      { id: 11, symbol: "XAUUSD", side: "buy", openDate: "2025-11-06T16:37:00", closeDate: "2025-11-07T00:23:00", openPrice: 4013.14, closePrice: 3995.24, tp: null, sl: null, lots: 0.02, pnl: -35.80 },
      { id: 12, symbol: "XAUUSD", side: "buy", openDate: "2025-11-06T21:08:00", closeDate: "2025-11-07T00:23:00", openPrice: 4009.59, closePrice: 3999.39, tp: null, sl: null, lots: 0.02, pnl: -20.40 },
      { id: 13, symbol: "XAUUSD", side: "buy", openDate: "2025-11-06T21:16:00", closeDate: "2025-11-07T00:23:00", openPrice: 4005.67, closePrice: 4011.97, tp: null, sl: null, lots: 0.02, pnl: 12.60 },
    ],
  },
  {
    id: "20481193",
    createdDate: "2025-09-12",
    broker: "XM",
    accountType: "Standard Cent",
    platform: "MetaTrader 4",
    size: 1000,
    startDate: "2025-09-12",
    trades: [],
  },
];

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
