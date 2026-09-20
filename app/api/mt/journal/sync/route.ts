import { NextRequest, NextResponse } from "next/server";
import { syncMtTrades } from "@/lib/server/mtSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* In-memory per-login throttle (per server instance): the EA pushes on a
 * timer, so anything beyond a burst is a misconfiguration or abuse. */
const HITS = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_HITS = 10;

function throttled(login: string): boolean {
  const now = Date.now();
  const hits = (HITS.get(login) ?? []).filter((at) => now - at < WINDOW_MS);
  hits.push(now);
  HITS.set(login, hits);
  if (HITS.size > 1000) {
    const oldest = [...HITS.entries()].sort((a, b) => (a[1][0] ?? 0) - (b[1][0] ?? 0))[0]?.[0];
    if (oldest) HITS.delete(oldest);
  }
  return hits.length > MAX_HITS;
}

/** Receives closed trades from the BeSight Journal EA running inside MT4/MT5.
 *  Public (no session) — auth is the account's own investor password, which
 *  is verified timing-safe and never logged. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      login?: string; server?: string; investorPassword?: string; trades?: unknown;
    };
    const login = String(body.login || "").trim();
    if (login && throttled(login)) {
      return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
    }
    const result = await syncMtTrades({
      login,
      server: body.server,
      investorPassword: String(body.investorPassword || ""),
      trades: Array.isArray(body.trades) ? body.trades : [],
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 400;
    const message = error instanceof Error ? error.message : "Sync failed";
    // Never echo credentials back, even in error paths.
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
