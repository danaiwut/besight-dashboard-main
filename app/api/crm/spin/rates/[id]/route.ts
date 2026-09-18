import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toBecRateDto } from "@/lib/server/spin";
import { adminWriteGuard } from "@/lib/session";


export const dynamic = "force-dynamic";

function fail(error: unknown, fallback: string, status = 400) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : fallback }, { status });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid rate id" }, { status: 400 });
    const existing = await getPrisma().becRate.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ ok: false, error: "Rate not found" }, { status: 404 });

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (body.pointsPerLot !== undefined) {
      const points = Number(body.pointsPerLot);
      if (!Number.isFinite(points) || points < 0) return NextResponse.json({ ok: false, error: "pointsPerLot must be 0 or more" }, { status: 400 });
      data.pointsPerLot = points;
    }
    if (body.active !== undefined) data.active = Boolean(body.active);
    const row = await getPrisma().becRate.update({ where: { id }, data });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, rate: toBecRateDto(row) });
  } catch (error) {
    return fail(error, "Unable to update BEC rate");
  }
}

/** Removes an override — the symbol then falls back to the built-in table. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid rate id" }, { status: 400 });
    const existing = await getPrisma().becRate.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ ok: false, error: "Rate not found" }, { status: 404 });
    await getPrisma().becRate.delete({ where: { id } });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return fail(error, "Unable to delete BEC rate");
  }
}
