import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { parseTradeBody, toJournalTrade, findOwnedJournalAccount } from "@/lib/server/journal";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberScopeGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Trades of one journal account (newest first, cap 2000). Filters: `?symbol=`
 *  `?side=buy|sell` `?open=1` (still-open only) `?from=` `?to=` (close-date window). */
export async function GET(request: NextRequest, { params }: Params) {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = guard.memberId;
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    if (!(await findOwnedJournalAccount(memberId, id))) return NextResponse.json({ ok: false, error: "Journal account not found" }, { status: 404 });

    const query = request.nextUrl.searchParams;
    const symbol = query.get("symbol")?.trim().toUpperCase() || undefined;
    const side = query.get("side");
    const openOnly = query.get("open") === "1";
    const from = query.get("from") ? new Date(`${query.get("from")}T00:00:00Z`) : undefined;
    const to = query.get("to") ? new Date(`${query.get("to")}T23:59:59Z`) : undefined;
    const rows = await getPrisma().journalTrade.findMany({
      where: {
        accountId: id,
        ...(symbol ? { symbol } : {}),
        ...(side === "buy" || side === "sell" ? { side } : {}),
        ...(openOnly ? { closeAt: null } : {}),
        ...(from && !Number.isNaN(from.getTime()) ? { closeAt: { gte: from } } : {}),
        ...(to && !Number.isNaN(to.getTime()) ? { closeAt: { lte: to } } : {}),
      },
      orderBy: [{ closeAt: "desc" }, { openAt: "desc" }],
      take: 2000,
    });
    return NextResponse.json({ ok: true, trades: rows.map((row) => toJournalTrade(row)) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load trades" }, { status: 500 });
  }
}

/** Hand-enters one trade (open trades omit close fields). */
export async function POST(request: NextRequest, { params }: Params) {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = guard.memberId;
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    if (!(await findOwnedJournalAccount(memberId, id))) return NextResponse.json({ ok: false, error: "Journal account not found" }, { status: 404 });

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const data = parseTradeBody(body);
    const created = await getPrisma().journalTrade.create({
      data: {
        accountId: id,
        symbol: data.symbol!,
        side: data.side!,
        openAt: data.openAt!,
        closeAt: data.closeAt ?? null,
        openPrice: data.openPrice!,
        closePrice: data.closePrice ?? null,
        tp: data.tp ?? null,
        sl: data.sl ?? null,
        lots: data.lots!,
        pnl: data.pnl ?? null,
        commission: data.commission ?? 0,
        swap: data.swap ?? 0,
        ticket: data.ticket ?? null,
        note: data.note ?? null,
        tagsJson: data.tagsJson ?? "[]",
      },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, trade: toJournalTrade(created) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to add trade" }, { status: 400 });
  }
}
