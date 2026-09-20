import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toCompetitionPrizeDto } from "@/lib/server/crmDtos";
import { adminGuard, adminWriteGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function findActivity(id: number) {
  return getPrisma().activity.findUnique({ where: { id }, select: { id: true, title: true } });
}

export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid activity id" }, { status: 400 });
    if (!(await findActivity(id))) return NextResponse.json({ ok: false, error: "Activity not found" }, { status: 404 });
    const prizes = await getPrisma().competitionPrize.findMany({
      where: { activityId: id },
      orderBy: [{ sortOrder: "asc" }, { rankFrom: "asc" }],
    });
    return NextResponse.json({ ok: true, prizes: prizes.map(toCompetitionPrizeDto) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load prizes" }, { status: 500 });
  }
}

/** Replace-all prize table. Ranges must be valid (rankFrom <= rankTo, both >= 1)
 *  and must not overlap — overlapping rows would award one rank twice. */
export async function PUT(request: NextRequest, { params }: Params) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid activity id" }, { status: 400 });
    if (!(await findActivity(id))) return NextResponse.json({ ok: false, error: "Activity not found" }, { status: 404 });
    const body = await request.json() as { prizes?: Array<Record<string, unknown>> };
    if (!Array.isArray(body.prizes)) return NextResponse.json({ ok: false, error: "prizes must be an array" }, { status: 400 });
    const rows = body.prizes.map((raw, index) => {
      const rankFrom = Math.floor(Number(raw.rankFrom));
      const rankTo = Math.floor(Number(raw.rankTo));
      if (!Number.isInteger(rankFrom) || !Number.isInteger(rankTo) || rankFrom < 1 || rankTo < rankFrom) {
        throw new Error(`Row #${index + 1}: rank range is invalid`);
      }
      const title = String(raw.title || "").trim();
      if (!title) throw new Error(`Row #${index + 1}: title is required`);
      return {
        rankFrom,
        rankTo,
        title,
        valueNote: String(raw.valueNote || "").trim() || null,
        sortOrder: Number.isInteger(Number(raw.sortOrder)) ? Number(raw.sortOrder) : index,
      };
    });
    const covered = new Set<number>();
    for (const row of rows) {
      for (let rank = row.rankFrom; rank <= row.rankTo; rank++) {
        if (covered.has(rank)) throw new Error(`Rank ${rank} is covered by more than one prize row`);
        covered.add(rank);
      }
    }
    const prisma = getPrisma();
    await prisma.$transaction(async (tx) => {
      await tx.competitionPrize.deleteMany({ where: { activityId: id } });
      if (rows.length) await tx.competitionPrize.createMany({ data: rows.map((row) => ({ activityId: id, ...row })) });
    });
    const prizes = await prisma.competitionPrize.findMany({
      where: { activityId: id },
      orderBy: [{ sortOrder: "asc" }, { rankFrom: "asc" }],
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, prizes: prizes.map(toCompetitionPrizeDto) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save prizes" }, { status: 400 });
  }
}
