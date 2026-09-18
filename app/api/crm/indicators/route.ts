import { NextRequest, NextResponse } from "next/server";
import { RecordStatus } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toIndicatorAccessDto, toIndicatorDto } from "@/lib/server/crmDtos";
import { adminGuard, adminWriteGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const records = await getPrisma().indicator.findMany({
      orderBy: { id: "asc" },
      include: { planEntitlements: true, access: true },
    });
    const indicators = records.map(toIndicatorDto);
    const indicatorAccess = records.flatMap((indicator) => indicator.access.map((access) => toIndicatorAccessDto(indicator.name, access)));
    const planEntitlements = { free: [] as number[], ib_partner: [] as number[] };
    for (const indicator of records) {
      for (const entitlement of indicator.planEntitlements) planEntitlements[entitlement.plan].push(indicator.id);
    }
    return NextResponse.json({ ok: true, indicators, indicatorAccess, planEntitlements });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load Indicators" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
    const prisma = getPrisma();
    if (await prisma.indicator.findUnique({ where: { name }, select: { id: true } })) {
      return NextResponse.json({ ok: false, error: `Indicator ${name} already exists` }, { status: 400 });
    }
    const indicator = await prisma.indicator.create({
      data: {
        name,
        publicationId: String(body.publicationId ?? body.pubId ?? "").trim() || null,
        status: body.status === "inactive" ? RecordStatus.inactive : RecordStatus.active,
      },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, indicator: toIndicatorDto(indicator) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to create indicator" }, { status: 400 });
  }
}
