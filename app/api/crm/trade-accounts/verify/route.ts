import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { verifyTradeId } from "@/lib/server/tradeVerification";
import { toTradeAccountDto } from "@/lib/server/crmDtos";
import { adminWriteGuard } from "@/lib/session";


export const dynamic = "force-dynamic";

/** Real Trade ID verification against the lot-check webhook — replaces the old
 *  deterministic simulator whose fake result was written straight into the DB.
 *
 *  - trades found  → verified
 *  - no trades     → pending (NOT an error: the account may trade later)
 *  - webhook error → 502, nothing written
 *
 *  Pass `accountId` to persist the outcome onto an existing row; omit it to use
 *  this purely as a preview (the member form's "Check" on a not-yet-saved row). */
export async function POST(request: NextRequest) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  try {
    const body = await request.json() as { tradeId?: string; accountId?: number };
    const tradeId = String(body.tradeId || "").trim();
    if (!tradeId) return NextResponse.json({ ok: false, error: "tradeId is required" }, { status: 400 });

    const accountId = Number(body.accountId);
    const hasAccountId = Number.isInteger(accountId) && accountId > 0;

    let verification;
    let hasTrades;
    let totalLots;
    let message;
    try {
      ({ verification, hasTrades, totalLots, message } = await verifyTradeId(tradeId));
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Lot service unavailable" },
        { status: 502 },
      );
    }

    if (!hasAccountId || !isDatabaseConfigured()) {
      return NextResponse.json({ ok: true, verification, hasTrades, totalLots, message });
    }

    const prisma = getPrisma();
    const existing = await prisma.tradeAccount.findUnique({ where: { id: accountId }, select: { id: true } });
    if (!existing) return NextResponse.json({ ok: false, error: "Trade account not found" }, { status: 404 });

    const account = await prisma.tradeAccount.update({
      where: { id: accountId },
      data: { verification, lastSyncAt: new Date() },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, verification, hasTrades, totalLots, message, tradeAccount: toTradeAccountDto(account) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to verify Trade ID" }, { status: 500 });
  }
}
