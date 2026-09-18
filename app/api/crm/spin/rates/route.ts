import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toBecRateDto } from "@/lib/server/spin";
import { DEFAULT_BEC_RATES } from "@/lib/becRates";
import { adminGuard, adminWriteGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

function fail(error: unknown, fallback: string, status = 400) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : fallback }, { status });
}

export async function GET() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const rows = await getPrisma().becRate.findMany({ orderBy: [{ symbol: "asc" }] });
    return NextResponse.json({ ok: true, rates: rows.map(toBecRateDto) });
  } catch (error) {
    return fail(error, "Unable to load BEC rates", 500);
  }
}

/** Adds one symbol override, or (with `seedDefaults:true`) imports the whole
 *  built-in loyalty table so every symbol from the sheet is editable. */
export async function POST(request: NextRequest) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const prisma = getPrisma();

    if (body.seedDefaults === true) {
      let imported = 0;
      for (const [symbol, pointsPerLot] of DEFAULT_BEC_RATES) {
        await prisma.becRate.upsert({
          where: { symbol },
          update: { pointsPerLot, active: true },
          create: { symbol, pointsPerLot, active: true },
        });
        imported += 1;
      }
      await bumpDataVersion();
      return NextResponse.json({ ok: true, imported });
    }

    const symbol = String(body.symbol || "").trim().toUpperCase();
    if (!symbol) return NextResponse.json({ ok: false, error: "Symbol is required" }, { status: 400 });
    const pointsPerLot = Number(body.pointsPerLot);
    if (!Number.isFinite(pointsPerLot) || pointsPerLot < 0) {
      return NextResponse.json({ ok: false, error: "pointsPerLot must be 0 or more" }, { status: 400 });
    }
    const row = await prisma.becRate.upsert({
      where: { symbol },
      update: { pointsPerLot, active: body.active === undefined ? true : Boolean(body.active) },
      create: { symbol, pointsPerLot, active: body.active === undefined ? true : Boolean(body.active) },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, rate: toBecRateDto(row) });
  } catch (error) {
    return fail(error, "Unable to save BEC rate");
  }
}
