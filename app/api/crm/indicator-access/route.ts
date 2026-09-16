import { NextRequest, NextResponse } from "next/server";
import { AccessSource, IndicatorAccessStatus } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toIndicatorAccessDto } from "@/lib/server/crmDtos";

export const dynamic = "force-dynamic";

const STATUSES = ["active", "suspended", "pending", "expired"] as const;
const SOURCES: Record<string, AccessSource> = {
  Broker: AccessSource.Broker,
  Admin: AccessSource.Admin,
  "Special Access": AccessSource.SpecialAccess,
  SpecialAccess: AccessSource.SpecialAccess,
  Plan: AccessSource.Plan,
};

function parseDate(value: unknown): Date | undefined {
  if (value == null || value === "") return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const memberId = Number(body.memberId);
    if (!Number.isInteger(memberId) || memberId <= 0) {
      return NextResponse.json({ ok: false, error: "memberId is required" }, { status: 400 });
    }
    const prisma = getPrisma();
    const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } });
    if (!member) return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });

    const indicatorIdRaw = Number(body.indicatorId);
    const indicator = Number.isInteger(indicatorIdRaw) && indicatorIdRaw > 0
      ? await prisma.indicator.findUnique({ where: { id: indicatorIdRaw } })
      : String(body.indicatorName || body.indicator || "").trim()
        ? await prisma.indicator.findUnique({ where: { name: String(body.indicatorName || body.indicator || "").trim() } })
        : null;
    if (!indicator) return NextResponse.json({ ok: false, error: "Indicator not found" }, { status: 404 });

    const dup = await prisma.memberIndicatorAccess.findUnique({
      where: { memberId_indicatorId: { memberId, indicatorId: indicator.id } },
    });
    if (dup) return NextResponse.json({ ok: false, error: "Member already has an access record for this indicator" }, { status: 400 });

    const status = STATUSES.includes(body.status as (typeof STATUSES)[number])
      ? body.status as IndicatorAccessStatus
      : IndicatorAccessStatus.active;
    const source = SOURCES[String(body.source || "Admin")] || AccessSource.Admin;
    const startsAt = parseDate(body.startsAt ?? body.startDate) || new Date();
    const expiresAt = parseDate(body.expiresAt ?? body.expiryDate) || startsAt;

    const access = await prisma.memberIndicatorAccess.create({
      data: { memberId, indicatorId: indicator.id, status, source, startsAt, expiresAt },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, indicatorAccess: toIndicatorAccessDto(indicator.name, access) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to grant indicator access" }, { status: 400 });
  }
}
