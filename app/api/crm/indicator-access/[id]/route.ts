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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid access id" }, { status: 400 });
    const prisma = getPrisma();
    const current = await prisma.memberIndicatorAccess.findUnique({ where: { id }, include: { indicator: true } });
    if (!current) return NextResponse.json({ ok: false, error: "Access record not found" }, { status: 404 });

    const body = await request.json() as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) {
        return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
      }
      data.status = body.status as IndicatorAccessStatus;
    }
    if (body.source !== undefined) {
      const source = SOURCES[String(body.source)];
      if (!source) return NextResponse.json({ ok: false, error: "Invalid source" }, { status: 400 });
      data.source = source;
    }
    const startsAt = parseDate(body.startsAt ?? body.startDate);
    if (startsAt) data.startsAt = startsAt;
    const expiresAt = parseDate(body.expiresAt ?? body.expiryDate);
    if (expiresAt) data.expiresAt = expiresAt;
    // A manual extend/renew stamps the renewal clock, mirroring the UI badge.
    if (body.renewed === true || (expiresAt && (!body.status || body.status === "active"))) {
      data.lastRenewedAt = new Date();
    }

    const access = await prisma.memberIndicatorAccess.update({ where: { id }, data });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, indicatorAccess: toIndicatorAccessDto(current.indicator.name, access) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update indicator access" }, { status: 400 });
  }
}
