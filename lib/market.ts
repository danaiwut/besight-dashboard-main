/** Market price feed (journal trade form) — client-safe.
 *  Broker symbols carry account-type suffixes (EURUSD#, EURUSDm#, GOLDmicro);
 *  prices come from Yahoo Finance chart data through /api/market/candles
 *  (server proxy — the browser never talks to Yahoo directly). */

export type TimeframeKey = "1m" | "5m" | "15m" | "1h" | "4h" | "1D";

export const TIMEFRAMES: { key: TimeframeKey; interval: string; range: string }[] = [
  { key: "1m", interval: "1m", range: "1d" },
  { key: "5m", interval: "5m", range: "5d" },
  { key: "15m", interval: "15m", range: "5d" },
  { key: "1h", interval: "1h", range: "1mo" },
  { key: "4h", interval: "1h", range: "3mo" },
  { key: "1D", interval: "1d", range: "1y" },
];

/** Popular picks shown first in the symbol search. */
export const POPULAR_SYMBOLS = [
  "XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
  "EURJPY", "GBPJPY", "BTCUSD", "ETHUSD", "US30", "NAS100", "SPX500",
];

/** Strip broker account-type suffixes (EURUSD# / EURUSDm# / GOLDmicro → base). */
export function normalizeBrokerSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/(M#|MICRO|#)$/, "");
}

/** Map a base symbol to a Yahoo Finance ticker. Unknown FX-style pairs fall
 *  back to the `=X` spot convention. */
export function toYahooTicker(baseSymbol: string): string {
  const base = normalizeBrokerSymbol(baseSymbol);
  const explicit: Record<string, string> = {
    XAUUSD: "XAUUSD=X",
    XAGUSD: "XAGUSD=X",
    GOLD: "XAUUSD=X",
    SILVER: "XAGUSD=X",
    BTCUSD: "BTC-USD",
    ETHUSD: "ETH-USD",
    US30: "YM=F",
    NAS100: "NQ=F",
    US100: "NQ=F",
    SPX500: "ES=F",
    US500: "ES=F",
    GER40: "^GDAXI",
    UK100: "^FTSE",
    JPN225: "^N225",
  };
  if (explicit[base]) return explicit[base];
  if (/^[A-Z]{6}$/.test(base)) return `${base}=X`;
  if (/^[A-Z]{6,7}$/.test(base)) return `${base}=X`;
  return base;
}

/** Searchable universe: popular picks + normalized broker bases. */
export function buildSymbolUniverse(brokerSymbols: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const symbol of [...POPULAR_SYMBOLS, ...brokerSymbols.map(normalizeBrokerSymbol)]) {
    const base = symbol.trim().toUpperCase();
    if (!base || seen.has(base)) continue;
    seen.add(base);
    out.push(base);
  }
  return out;
}

export type CandlePoint = { t: number; c: number };

/** Contract size (units per 1.0 lot) for floating-P&L estimates. FX uses the
 *  standard 100,000 — profit lands in the quote currency (see below). */
export function contractSizeOf(baseSymbol: string): number | null {
  const base = normalizeBrokerSymbol(baseSymbol);
  if (base === "BTCUSD" || base === "ETHUSD") return 1;
  if (base === "XAUUSD" || base === "GOLD") return 100;
  if (base === "XAGUSD" || base === "SILVER") return 5000;
  if (/^[A-Z]{6}$/.test(base)) return 100000;
  return null;
}

/** Currency the P&L lands in (null when unknown). The $ estimate only shows
 *  for USD profits — anything else shows price distance, never a fake $. */
export function profitCurrencyOf(baseSymbol: string): string | null {
  const base = normalizeBrokerSymbol(baseSymbol);
  if (["BTCUSD", "ETHUSD", "XAUUSD", "GOLD", "XAGUSD", "SILVER"].includes(base)) return "USD";
  if (/^[A-Z]{6}$/.test(base)) return base.slice(3);
  return null;
}

export type CandlesResponse = {
  symbol: string;
  ticker: string;
  interval: string;
  price: number;
  changePct: number;
  candles: CandlePoint[];
  asOf: string;
};
