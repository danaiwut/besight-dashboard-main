import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";

export const dynamic = "force-dynamic";

function toDto(row: { id: bigint; tradeAccountId: number; memberId: number; symbol: string; lots: { toNumber(): number }; rebate: { toNumber(): number }; tradeDate: Date }) {
  return {
    id: Number(row.id),
    tradeAccountId: row.tradeAccountId,
    memberId: row.memberId,
    symbol: row.symbol,
    lots: row.lots.toNumber(),
    rebate: row.rebate.toNumber(),
    tradeDate: row.tradeDate.toISOString().slice(0, 10),
  };
}

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  const rawAccountId = request.nextUrl.searchParams.get("tradeAccountId");

  try {
    // No tradeAccountId → bulk read for the CRM provider: the last 3 months of
    // ledger rows across every account (matching the trade-log-snapshot cron's
    // retention window), capped so the initial page load stays bounded.
    if (rawAccountId == null || rawAccountId === "") {
      const since = new Date();
      since.setUTCMonth(since.getUTCMonth() - 3);
      const rows = await getPrisma().tradeLog.findMany({
        where: { tradeDate: { gte: since } },
        orderBy: { tradeDate: "desc" },
        take: 5000,
      });
      return NextResponse.json({ ok: true, tradeLogs: rows.map(toDto) });
    }

    const tradeAccountId = Number(rawAccountId);
    if (!Number.isInteger(tradeAccountId) || tradeAccountId <= 0) {
      return NextResponse.json({ ok: false, error: "tradeAccountId is required" }, { status: 400 });
    }

    const rows = await getPrisma().tradeLog.findMany({
      where: { tradeAccountId },
      orderBy: { tradeDate: "desc" },
    });
    return NextResponse.json({ ok: true, tradeLogs: rows.map(toDto) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load Trade Logs" }, { status: 500 });
  }
}
