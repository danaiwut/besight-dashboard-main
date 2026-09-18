import { NextRequest, NextResponse } from "next/server";
import { AccessSource, IndicatorAccessStatus } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toIndicatorAccessDto } from "@/lib/server/crmDtos";
import { readIndicatorAutomationSettings } from "@/lib/server/indicatorSettings";
import { getMemberLots } from "@/lib/server/lotService";
import { resolveLotWindow, snapshotMatchesWindow } from "@/lib/lotEngine";
import { adminWriteGuard } from "@/lib/session";


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
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid access id" }, { status: 400 });
    const prisma = getPrisma();
    const current = await prisma.memberIndicatorAccess.findUnique({ where: { id }, include: { indicator: true } });
    if (!current) return NextResponse.json({ ok: false, error: "Access record not found" }, { status: 404 });

    const body = await request.json() as Record<string, unknown>;

    // Manual renewal: extend from max(current expiry, now) — never from a
    // stale past date — and record it in the renewal history with the
    // member's current cycle lots attached. No lot threshold is enforced
    // (admin decision), but the evidence travels with the record.
    if (body.extend === true) {
      if (current.manualLock) {
        return NextResponse.json({ ok: false, error: "Access is manually locked — automation and renewal are disabled for it" }, { status: 400 });
      }
      const monthsRaw = Number(body.months);
      const settings = await readIndicatorAutomationSettings();
      const months = Number.isInteger(monthsRaw) && monthsRaw >= 1 ? monthsRaw : settings.renewalMonths;
      const member = await prisma.member.findUnique({
        where: { id: current.memberId },
        select: {
          id: true, crmStartDate: true, crmExpiryDate: true, requiredLotsOverride: true,
          currentPeriodLots: true, currentPeriodLotsFrom: true, currentPeriodLotsTo: true,
        },
      });
      if (!member) return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });
      const now = new Date();
      const base = current.expiresAt > now ? current.expiresAt : now;
      const newExpiry = new Date(base);
      newExpiry.setUTCMonth(newExpiry.getUTCMonth() + months);
      const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
      const window = resolveLotWindow(
        { crmStartDate: day(member.crmStartDate) ?? undefined, crmExpiryDate: day(member.crmExpiryDate) ?? undefined },
        "cycle",
        now,
      );
      const requiredLots = member.requiredLotsOverride?.toNumber() ?? settings.requiredLots;
      let qualifiedLots: number;
      let lotsNote: string | null = null;
      try {
        qualifiedLots = (await getMemberLots(member.id, "cycle")).lots;
      } catch {
        const fresh = snapshotMatchesWindow(
          { from: day(member.currentPeriodLotsFrom), to: day(member.currentPeriodLotsTo) },
          window,
        );
        qualifiedLots = member.currentPeriodLots.toNumber();
        lotsNote = fresh ? "Snapshot lots (live check unavailable)" : "Stale-window snapshot lots (live check unavailable)";
      }
      const revived = current.status === IndicatorAccessStatus.suspended;
      const access = await prisma.memberIndicatorAccess.update({
        where: { id },
        data: { status: IndicatorAccessStatus.active, expiresAt: newExpiry, lastRenewedAt: now },
      });
      const note = lotsNote ?? (revived ? "Manual extend (revived from suspended)" : "Manual extend");
      await prisma.renewalRecord.create({
        data: {
          memberId: member.id, indicatorId: current.indicatorId, indicatorAccessId: access.id,
          period: window.period, qualifiedLots, requiredLots, renewed: true,
          origin: "manual", note,
          oldExpiry: current.expiresAt, newExpiry,
        },
      });
      await prisma.activityLog.create({
        data: {
          memberId: member.id, actor: "Admin", action: "Indicator Renewed",
          description: `${current.indicator.name} manually extended ${months} month(s): ${day(current.expiresAt)} → ${newExpiry.toISOString().slice(0, 10)} (${qualifiedLots.toFixed(2)} / ${requiredLots.toFixed(2)} lots for ${window.period}).`,
        },
      });
      await bumpDataVersion();
      return NextResponse.json({
        ok: true, indicatorAccess: toIndicatorAccessDto(current.indicator.name, access),
        renewal: { renewed: true, qualifiedLots, requiredLots, period: window.period, origin: "manual" },
      });
    }

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
