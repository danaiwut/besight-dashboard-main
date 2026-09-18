import { NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberGuard } from "@/lib/session";
import { becBalance, readSpinSettings } from "@/lib/server/spin";
import { DEFAULT_BEC_RATES } from "@/lib/becRates";

export const dynamic = "force-dynamic";

export type BecRateRowDto = { symbol: string; pointsPerLot: number };

/** Live BEC earn-rate table for customers — the exact rows the admin edits in
 *  the CRM, plus the member's own balance so the numbers have context. */
export async function GET() {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const prisma = getPrisma();
    const memberId = await resolveMemberIdForUser(guard.user);
    const [rows, settings, balance] = await Promise.all([
      prisma.becRate.findMany({ where: { active: true }, orderBy: [{ pointsPerLot: "desc" }, { symbol: "asc" }] }),
      readSpinSettings(),
      memberId ? becBalance(memberId) : Promise.resolve({ earned: 0, spent: 0, balance: 0 }),
    ]);

    // DB overrides win; the built-in loyalty table covers anything not overridden.
    const dbSymbols = new Set(rows.map((row) => row.symbol.toUpperCase()));
    const rates: BecRateRowDto[] = [
      ...rows.map((row) => ({ symbol: row.symbol, pointsPerLot: row.pointsPerLot.toNumber() })),
      ...DEFAULT_BEC_RATES.filter(([symbol]) => !dbSymbols.has(symbol.toUpperCase())).map(([symbol, pointsPerLot]) => ({ symbol, pointsPerLot })),
    ].sort((a, b) => b.pointsPerLot - a.pointsPerLot || a.symbol.localeCompare(b.symbol));

    const updatedAt = rows.reduce<Date | null>((latest, row) => (!latest || row.updatedAt > latest ? row.updatedAt : latest), null);

    return NextResponse.json({
      ok: true,
      rates,
      defaultPointsPerLot: settings.defaultPointsPerLot,
      costPerSpin: settings.costPerSpin,
      spinEnabled: settings.enabled,
      earned: balance.earned,
      spent: balance.spent,
      balance: balance.balance,
      updatedAt: updatedAt?.toISOString() ?? null,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load BEC rates" }, { status: 500 });
  }
}
