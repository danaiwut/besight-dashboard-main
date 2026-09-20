import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { TIMEFRAMES, normalizeBrokerSymbol, type TimeframeKey } from "@/lib/market";
import { fetchMarketCandles } from "@/lib/server/market";
import { memberGuard } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type CacheEntry = { at: number; payload: object };
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function fail(message: string, status = 502) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** Live candles + current price for one symbol, proxied from Yahoo Finance
 *  chart data (the browser never talks to Yahoo directly). Cached ~30s
 *  server-side so the auto-refreshing form can't hammer the upstream. */
export async function GET(request: NextRequest) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const rawSymbol = (request.nextUrl.searchParams.get("symbol") || "").trim().toUpperCase();
    const rawSymbols = (request.nextUrl.searchParams.get("symbols") || "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z0-9#.]{1,20}$/.test(s))
      .slice(0, 10);
    const tf = (request.nextUrl.searchParams.get("interval") || "15m") as TimeframeKey;
    const frame = TIMEFRAMES.find((row) => row.key === tf) ?? TIMEFRAMES[2];

    // Batch mode for the live-positions watch (one round-trip per refresh;
    // one bad symbol never sinks the rest).
    if (rawSymbols.length > 1 || (rawSymbols.length === 1 && !rawSymbol)) {
      const quotes: Record<string, object> = {};
      await mapWithConcurrency(rawSymbols, 4, async (item) => {
        try {
          quotes[item] = await quoteFor(normalizeBrokerSymbol(item), frame);
        } catch (error) {
          quotes[item] = { symbol: item, error: error instanceof Error ? error.message : "Price feed unavailable" };
        }
      });
      return NextResponse.json({ ok: true, quotes });
    }

    if (!/^[A-Z0-9#.]{1,20}$/.test(rawSymbol)) return fail("Invalid symbol", 400);
    return NextResponse.json({ ok: true, ...(await quoteFor(normalizeBrokerSymbol(rawSymbol), frame)) });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Price feed unavailable");
  }
}

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function quoteFor(symbol: string, frame: { key: TimeframeKey; interval: string; range: string }) {
  const cacheKey = `${symbol}|${frame.key}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { symbol, ...(cached.payload as Record<string, unknown>), cached: true };
  }
  const data = await fetchMarketCandles(symbol, frame);
  const payload = { symbol, ...data, requestedInterval: frame.key, asOf: new Date().toISOString() };
  CACHE.set(cacheKey, { at: Date.now(), payload });
  if (CACHE.size > 200) {
    const oldest = [...CACHE.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
    if (oldest) CACHE.delete(oldest);
  }
  return payload;
}
