import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { parseTradeBody, toJournalTrade } from "@/lib/server/journal";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberScopeGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function ownTrade(memberId: number, id: number) {
  return getPrisma().journalTrade.findFirst({
    where: { id, account: { memberId } },
    select: { id: true, accountId: true },
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = guard.memberId;
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    if (!(await ownTrade(memberId, id))) return NextResponse.json({ ok: false, error: "Trade not found" }, { status: 404 });

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const data = parseTradeBody(body, true);
    // Non-nullable columns can't be nulled — drop explicit nulls for them
    // (nullable close fields like closeAt: null pass through to reopen).
    const { openAt, openPrice, lots, symbol, side, commission, swap, ticket, note, ...rest } = data;
    const updateData = {
      ...rest,
      ...(openAt != null ? { openAt } : {}),
      ...(openPrice != null ? { openPrice } : {}),
      ...(lots != null ? { lots } : {}),
      ...(symbol ? { symbol } : {}),
      ...(side ? { side } : {}),
      ...(commission != null ? { commission } : {}),
      ...(swap != null ? { swap } : {}),
      ...(ticket !== undefined ? { ticket } : {}),
      ...(note !== undefined ? { note } : {}),
    };
    if (!Object.keys(updateData).length) return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
    const updated = await getPrisma().journalTrade.update({ where: { id }, data: updateData });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, trade: toJournalTrade(updated) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update trade" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = guard.memberId;
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    if (!(await ownTrade(memberId, id))) return NextResponse.json({ ok: false, error: "Trade not found" }, { status: 404 });
    await getPrisma().journalTrade.delete({ where: { id } });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to delete trade" }, { status: 400 });
  }
}
