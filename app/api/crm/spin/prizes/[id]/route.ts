import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { parseSpinPrizeBody, toSpinPrizeDto } from "@/lib/server/spin";
import { adminWriteGuard } from "@/lib/session";


export const dynamic = "force-dynamic";

function fail(error: unknown, fallback: string, status = 400) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : fallback }, { status });
}

async function findPrize(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  return getPrisma().spinPrize.findUnique({ where: { id }, select: { id: true } });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!(await findPrize(id))) return NextResponse.json({ ok: false, error: "Prize not found" }, { status: 404 });
    const body = await request.json() as Record<string, unknown>;
    const prize = await getPrisma().spinPrize.update({ where: { id }, data: parseSpinPrizeBody(body) });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, prize: toSpinPrizeDto(prize) });
  } catch (error) {
    return fail(error, "Unable to update prize");
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!(await findPrize(id))) return NextResponse.json({ ok: false, error: "Prize not found" }, { status: 404 });
    // History must survive: a prize that has been won can only be deactivated.
    const wins = await getPrisma().spinResult.count({ where: { prizeId: id } });
    if (wins > 0) {
      return NextResponse.json(
        { ok: false, error: `รางวัลนี้ถูกหมุนไปแล้ว ${wins} ครั้ง — ปิดการใช้งานแทนการลบ`, code: "prize_in_use" },
        { status: 409 },
      );
    }
    await getPrisma().spinPrize.delete({ where: { id } });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return fail(error, "Unable to delete prize");
  }
}
