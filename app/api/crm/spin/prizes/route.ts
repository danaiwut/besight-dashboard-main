import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { parseSpinPrizeBody, toSpinPrizeDto } from "@/lib/server/spin";
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
    const rows = await getPrisma().spinPrize.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    return NextResponse.json({ ok: true, prizes: rows.map(toSpinPrizeDto) });
  } catch (error) {
    return fail(error, "Unable to load prizes", 500);
  }
}

export async function POST(request: NextRequest) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const data = parseSpinPrizeBody(body);
    if (!data.name) return NextResponse.json({ ok: false, error: "Prize name is required" }, { status: 400 });
    const prize = await getPrisma().spinPrize.create({
      data: {
        name: data.name as string,
        icon: (data.icon as string) ?? "redeem",
        image: (data.image as string | null) ?? null,
        valueNote: (data.valueNote as string | null) ?? null,
        weight: (data.weight as number) ?? 1,
        stock: (data.stock as number | null) ?? null,
        sortOrder: (data.sortOrder as number) ?? 0,
        active: (data.active as boolean) ?? true,
      },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, prize: toSpinPrizeDto(prize) });
  } catch (error) {
    return fail(error, "Unable to create prize");
  }
}
