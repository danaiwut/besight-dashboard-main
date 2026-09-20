import { toYahooTicker, type CandlePoint, type TimeframeKey } from "../market";

/* ── Yahoo Finance chart proxy (server-only) ──
    The browser never talks to Yahoo directly. Yahoo rate-limits cookie-less
    callers, so a visit to the consent host first yields a cookie that keeps
    quotes flowing (cached process-wide, refreshed when stale or rejected). */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

let cookieJar = "";
let cookieAt = 0;
const COOKIE_TTL_MS = 30 * 60 * 1000;

async function refreshCookie(): Promise<string> {
  try {
    const response = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": UA },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    const setCookies = response.headers.getSetCookie?.() ?? [];
    if (setCookies.length) {
      cookieJar = setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
      cookieAt = Date.now();
    }
  } catch {
    // keep the previous jar (possibly empty) — the chart call decides
  }
  return cookieJar;
}

async function fetchChart(url: string): Promise<Response> {
  if (!cookieJar || Date.now() - cookieAt > COOKIE_TTL_MS) await refreshCookie();
  let response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", ...(cookieJar ? { Cookie: cookieJar } : {}) },
    signal: AbortSignal.timeout(12_000),
  });
  if ((response.status === 401 || response.status === 429) && (await refreshCookie())) {
    response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json", Cookie: cookieJar },
      signal: AbortSignal.timeout(12_000),
    });
  }
  return response;
}

export type YahooCandles = {
  ticker: string;
  interval: TimeframeKey;
  price: number;
  changePct: number;
  candles: CandlePoint[];
  source: "yahoo" | "binance" | "kraken" | "stooq";
};

export async function fetchYahooCandles(symbol: string, timeframe: { key: TimeframeKey; interval: string; range: string }): Promise<YahooCandles> {
  const ticker = toYahooTicker(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${timeframe.interval}&range=${timeframe.range}`;
  const response = await fetchChart(url);
  if (!response.ok) throw new Error(`Price feed unavailable (${response.status})`);
  const body = (await response.json()) as {
    chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: (number | null)[] }> }; meta?: { previousClose?: number } }>; error?: { description?: string } | null };
  };
  if (body.chart?.error) throw new Error(body.chart.error.description || "Price feed error");
  const result = body.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const candles = timestamps
    .map((t, i) => ({ t: t * 1000, c: closes[i] }))
    .filter((row): row is CandlePoint => typeof row.c === "number" && Number.isFinite(row.c))
    .slice(-120);
  if (!candles.length) throw new Error("No price data for this symbol");
  const price = candles[candles.length - 1].c;
  const reference = result?.meta?.previousClose && Number.isFinite(result.meta.previousClose)
    ? result.meta.previousClose
    : candles[0].c;
  return {
    ticker,
    interval: timeframe.key,
    price,
    changePct: reference ? ((price - reference) / reference) * 100 : 0,
    candles,
    source: "yahoo",
  };
}

/** Stooq symbol for a base symbol (lowercase spot convention). */
function toStooqSymbol(baseSymbol: string): string | null {
  const base = baseSymbol.trim().toUpperCase();
  const explicit: Record<string, string> = {
    GOLD: "xauusd",
    SILVER: "xagusd",
    BTCUSD: "btcusd",
    ETHUSD: "ethusd",
    US30: "^dji",
    NAS100: "^ndq",
    US100: "^ndq",
    SPX500: "^spx",
    US500: "^spx",
    GER40: "^dax",
    UK100: "^ftse",
    JPN225: "^nkx",
  };
  if (explicit[base]) return explicit[base];
  if (/^[A-Z]{6,7}$/.test(base)) return base.toLowerCase();
  return null;
}

/** Fallback feed: Stooq daily history (very lenient limits, no key).
 *  Coarser than Yahoo intraday, but keeps the form usable when Yahoo
 *  rate-limits the server IP. Price = last daily close. */
async function fetchStooqDaily(baseSymbol: string): Promise<YahooCandles> {
  const stooq = toStooqSymbol(baseSymbol);
  if (!stooq) throw new Error("No price data for this symbol");
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooq)}&i=d`;
  const response = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Price feed unavailable (${response.status})`);
  const text = await response.text();
  const lines = text.split(/\r?\n/).slice(1).map((line) => line.trim()).filter(Boolean);
  const candles: CandlePoint[] = [];
  for (const line of lines.slice(-120)) {
    const [date, , , , close] = line.split(",");
    const time = new Date(`${date}T00:00:00Z`).getTime();
    const price = Number(close);
    if (Number.isNaN(time) || !Number.isFinite(price)) continue;
    candles.push({ t: time, c: price });
  }
  if (candles.length < 2) throw new Error("No price data for this symbol");
  const price = candles[candles.length - 1].c;
  const reference = candles[candles.length - 2].c;
  return {
    ticker: stooq,
    interval: "1D",
    price,
    changePct: reference ? ((price - reference) / reference) * 100 : 0,
    candles,
    source: "stooq",
  };
}

/** Yahoo intraday first, exchange fallbacks next, Stooq daily last. Each
 *  layer throws when it has nothing, so the first feed with data wins and
 *  the original Yahoo error surfaces only when everything is down. */
export async function fetchMarketCandles(
  symbol: string,
  timeframe: { key: TimeframeKey; interval: string; range: string },
): Promise<YahooCandles> {
  const base = symbol.trim().toUpperCase();
  const attempts: Array<() => Promise<YahooCandles>> = [() => fetchYahooCandles(base, timeframe)];
  if (BINANCE_SPOT[base]) attempts.push(() => fetchBinanceKlines(base, timeframe.key));
  if (KRAKEN_PAIR[base]) attempts.push(() => fetchKrakenOHLC(base, timeframe.key));
  attempts.push(() => fetchStooqDaily(base));
  let lastError: unknown = new Error("No price data for this symbol");
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

const BINANCE_INTERVAL: Record<TimeframeKey, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1D": "1d" };

/** Binance spot klines — crypto + tokenized gold, full intraday ranges. */
const BINANCE_SPOT: Record<string, string> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
  XAUUSD: "PAXGUSDT",
  GOLD: "PAXGUSDT",
};

async function fetchBinanceKlines(baseSymbol: string, tf: TimeframeKey): Promise<YahooCandles> {
  const pair = BINANCE_SPOT[baseSymbol];
  if (!pair) throw new Error("Not on Binance");
  const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${BINANCE_INTERVAL[tf]}&limit=120`;
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Price feed unavailable (${response.status})`);
  const rows = (await response.json()) as Array<[number, string, string, string, string]>;
  const candles: CandlePoint[] = rows
    .map((row) => ({ t: row[0], c: Number(row[4]) }))
    .filter((row) => Number.isFinite(row.c));
  if (candles.length < 2) throw new Error("No price data for this symbol");
  const price = candles[candles.length - 1].c;
  const reference = candles[0].c;
  return { ticker: pair, interval: tf, price, changePct: ((price - reference) / reference) * 100, candles, source: "binance" };
}

const KRAKEN_INTERVAL: Record<TimeframeKey, number> = { "1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1D": 1440 };

/** Kraken OHLC — FX majors, tokenized gold and crypto. (No GBPJPY / silver
 *  vs USD on Kraken — those fall through to Stooq daily.) */
const KRAKEN_PAIR: Record<string, string> = {
  EURUSD: "EURUSD", GBPUSD: "GBPUSD", USDJPY: "USDJPY", AUDUSD: "AUDUSD",
  USDCAD: "USDCAD", USDCHF: "USDCHF", NZDUSD: "NZDUSD", EURJPY: "EURJPY",
  EURGBP: "EURGBP",
  XAUUSD: "PAXGUSD", GOLD: "PAXGUSD",
  BTCUSD: "XBTUSD", ETHUSD: "ETHUSD",
};

async function fetchKrakenOHLC(baseSymbol: string, tf: TimeframeKey): Promise<YahooCandles> {
  const pair = KRAKEN_PAIR[baseSymbol];
  if (!pair) throw new Error("Not on Kraken");
  const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${KRAKEN_INTERVAL[tf]}`;
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Price feed unavailable (${response.status})`);
  const body = (await response.json()) as { error?: string[]; result?: Record<string, Array<[number, string, string, string, string, string, string, number]>> };
  if (body.error?.length) throw new Error(body.error.join(", "));
  const key = Object.keys(body.result ?? {}).find((k) => k !== "last");
  const rows = (key && body.result?.[key]) || [];
  const candles: CandlePoint[] = rows
    .map((row) => ({ t: row[0] * 1000, c: Number(row[4]) }))
    .filter((row) => Number.isFinite(row.c))
    .slice(-120);
  if (candles.length < 2) throw new Error("No price data for this symbol");
  const price = candles[candles.length - 1].c;
  const reference = candles[0].c;
  return { ticker: pair, interval: tf, price, changePct: ((price - reference) / reference) * 100, candles, source: "kraken" };
}
