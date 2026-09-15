import { NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";

export const dynamic = "force-dynamic";

const sourceLabel = {
  Broker: "Broker",
  Admin: "Admin",
  SpecialAccess: "Special Access",
  Plan: "Plan",
} as const;

export async function GET() {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const records = await getPrisma().indicator.findMany({
      orderBy: { id: "asc" },
      include: { planEntitlements: true, access: true },
    });
    const indicators = records.map((indicator) => ({
      id: indicator.id,
      name: indicator.name,
      pubId: indicator.publicationId || "",
      status: indicator.status,
    }));
    const indicatorAccess = records.flatMap((indicator) => indicator.access.map((access) => ({
      id: access.id,
      memberId: access.memberId,
      indicator: indicator.name,
      status: access.status,
      source: sourceLabel[access.source],
      startDate: access.startsAt.toISOString().slice(0, 10),
      expiryDate: access.expiresAt.toISOString().slice(0, 10),
      lastRenewalDate: access.lastRenewedAt?.toISOString().slice(0, 10),
    })));
    const planEntitlements = { free: [] as number[], ib_partner: [] as number[] };
    for (const indicator of records) {
      for (const entitlement of indicator.planEntitlements) planEntitlements[entitlement.plan].push(indicator.id);
    }
    return NextResponse.json({ ok: true, indicators, indicatorAccess, planEntitlements });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load Indicators" }, { status: 500 });
  }
}
