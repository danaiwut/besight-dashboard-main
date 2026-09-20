import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { toJournalAccountDto, toJournalTrade, toRiskRuleDto } from "@/lib/server/journal";
import { adminGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Read-only journal view for support — the member's journal accounts, risk
 *  rules and latest trades. Members own this data; admins only read it. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid member id" }, { status: 400 });
    const prisma = getPrisma();
    const member = await prisma.member.findUnique({ where: { id }, select: { id: true } });
    if (!member) return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });

    const accounts = await prisma.journalAccount.findMany({
      where: { memberId: id },
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { trades: true } },
        trades: { select: { closeAt: true } },
        riskRule: true,
      },
    });
    const trades = await prisma.journalTrade.findMany({
      where: { account: { memberId: id } },
      orderBy: [{ closeAt: "desc" }, { openAt: "desc" }],
      take: 100,
    });
    return NextResponse.json({
      ok: true,
      accounts: accounts.map((row) => ({
        ...toJournalAccountDto(row),
        rules: toRiskRuleDto(row.riskRule),
      })),
      trades: trades.map((row) => toJournalTrade(row)),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load journal" }, { status: 500 });
  }
}
