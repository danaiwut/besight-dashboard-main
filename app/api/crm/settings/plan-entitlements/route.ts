import { NextRequest, NextResponse } from "next/server";
import { Plan } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { adminSettingsGuard } from "@/lib/session";


export const dynamic = "force-dynamic";

function idList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

export async function PUT(request: NextRequest) {
  const guard = await adminSettingsGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const prisma = getPrisma();
    const existingIds = new Set((await prisma.indicator.findMany({ select: { id: true } })).map((i) => i.id));
    const entitlements = {
      [Plan.free]: idList(body.free).filter((id) => existingIds.has(id)),
      [Plan.ib_partner]: idList(body.ib_partner).filter((id) => existingIds.has(id)),
    };

    await prisma.$transaction(async (tx) => {
      await tx.planIndicatorEntitlement.deleteMany({});
      const rows = [
        ...entitlements[Plan.free].map((indicatorId) => ({ plan: Plan.free, indicatorId })),
        ...entitlements[Plan.ib_partner].map((indicatorId) => ({ plan: Plan.ib_partner, indicatorId })),
      ];
      if (rows.length) await tx.planIndicatorEntitlement.createMany({ data: rows });
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, planEntitlements: { free: entitlements[Plan.free], ib_partner: entitlements[Plan.ib_partner] } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save plan entitlements" }, { status: 400 });
  }
}
