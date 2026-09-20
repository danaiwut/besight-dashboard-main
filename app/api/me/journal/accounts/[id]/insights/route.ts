import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { buildInsights, toRiskRuleDto } from "@/lib/server/journal";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberScopeGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Rule-based coaching notes from the account's own closed trades — no
 *  external AI involved. Computed on read, never stored. */
export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = guard.memberId;
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    const prisma = getPrisma();
    const account = await prisma.journalAccount.findFirst({ where: { id, memberId }, select: { id: true } });
    if (!account) return NextResponse.json({ ok: false, error: "Journal account not found" }, { status: 404 });

    const [rows, rule] = await Promise.all([
      prisma.journalTrade.findMany({
        where: { accountId: id, closeAt: { not: null } },
        orderBy: { closeAt: "asc" },
        take: 5000,
        select: { symbol: true, openAt: true, closeAt: true, pnl: true, lots: true, sl: true, note: true },
      }),
      prisma.riskRule.findUnique({ where: { accountId: id } }),
    ]);
    const rules = toRiskRuleDto(rule);
    const num = (v: unknown) => (typeof v === "object" && v !== null && "toNumber" in v ? (v as { toNumber: () => number }).toNumber() : Number(v));
    const insights = buildInsights(
      rows.map((row) => ({
        symbol: row.symbol,
        openAt: row.openAt.toISOString(),
        closeAt: row.closeAt!.toISOString(),
        pnl: num(row.pnl),
        lots: num(row.lots),
        tags: [],
        sl: row.sl != null ? num(row.sl) : null,
        note: row.note || undefined,
      })),
      rules,
    );
    return NextResponse.json({ ok: true, insights });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to build insights" }, { status: 500 });
  }
}
