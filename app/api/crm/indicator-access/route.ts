import { NextRequest, NextResponse } from "next/server";
import { AccessSource, IndicatorAccessStatus } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toIndicatorAccessDto } from "@/lib/server/crmDtos";
import { readIndicatorAutomationSettings } from "@/lib/server/indicatorSettings";
import { getMemberLots } from "@/lib/server/lotService";
import { resolveLotWindow, snapshotMatchesWindow } from "@/lib/lotEngine";
import { actorFromSession, adminWriteGuard } from "@/lib/session";


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

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/** Grant indicator access with canonical grant-vs-renew semantics (one row per
 *  member+indicator, ever):
 *   - no record → fresh grant (`renewed: false`)
 *   - record expired (and not suspended) → re-grant as a new cycle, counted
 *     as a RENEWAL (`renewed: true`, startsAt = now)
 *   - record still active, or suspended → 400 (use Extend / unsuspend instead)
 *  Every write records a manual RenewalRecord with the member's current cycle
 *  lots attached, so the renewal history stays complete. */
export async function POST(request: NextRequest) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const memberId = Number(body.memberId);
    if (!Number.isInteger(memberId) || memberId <= 0) {
      return NextResponse.json({ ok: false, error: "memberId is required" }, { status: 400 });
    }
    const prisma = getPrisma();
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true, crmStartDate: true, crmExpiryDate: true, requiredLotsOverride: true,
        currentPeriodLots: true, currentPeriodLotsFrom: true, currentPeriodLotsTo: true,
      },
    });
    if (!member) return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });

    const indicatorIdRaw = Number(body.indicatorId);
    const indicator = Number.isInteger(indicatorIdRaw) && indicatorIdRaw > 0
      ? await prisma.indicator.findUnique({ where: { id: indicatorIdRaw } })
      : String(body.indicatorName || body.indicator || "").trim()
        ? await prisma.indicator.findUnique({ where: { name: String(body.indicatorName || body.indicator || "").trim() } })
        : null;
    if (!indicator) return NextResponse.json({ ok: false, error: "Indicator not found" }, { status: 404 });

    const now = new Date();
    const dup = await prisma.memberIndicatorAccess.findUnique({
      where: { memberId_indicatorId: { memberId, indicatorId: indicator.id } },
    });
    if (dup && (dup.status === IndicatorAccessStatus.suspended || dup.expiresAt > now)) {
      return NextResponse.json({
        ok: false,
        error: dup.status === IndicatorAccessStatus.suspended
          ? "Access is suspended — unsuspend or extend it instead of granting again"
          : "Member already has active access — use Extend to renew instead of granting again",
      }, { status: 400 });
    }

    const status = STATUSES.includes(body.status as (typeof STATUSES)[number])
      ? body.status as IndicatorAccessStatus
      : IndicatorAccessStatus.active;
    const source = SOURCES[String(body.source || "Admin")] || AccessSource.Admin;
    const settings = await readIndicatorAutomationSettings();

    // Current cycle lots attached to the history row (live, snapshot fallback).
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
      qualifiedLots = (await getMemberLots(memberId, "cycle")).lots;
    } catch {
      const fresh = snapshotMatchesWindow(
        { from: day(member.currentPeriodLotsFrom), to: day(member.currentPeriodLotsTo) },
        window,
      );
      qualifiedLots = member.currentPeriodLots.toNumber();
      lotsNote = fresh ? "Snapshot lots (live check unavailable)" : "Stale-window snapshot lots (live check unavailable)";
    }

    if (!dup) {
      const startsAt = parseDate(body.startsAt ?? body.startDate) || now;
      const expiresAt = parseDate(body.expiresAt ?? body.expiryDate) || addMonths(startsAt, settings.renewalMonths);
      const access = await prisma.memberIndicatorAccess.create({
        data: { memberId, indicatorId: indicator.id, status, source, startsAt, expiresAt },
      });
      await prisma.renewalRecord.create({
        data: {
          memberId, indicatorId: indicator.id, indicatorAccessId: access.id,
          period: window.period, qualifiedLots, requiredLots, renewed: false,
          origin: "manual", note: lotsNote ?? "Manual grant",
          oldExpiry: null, newExpiry: expiresAt,
        },
      });
      await prisma.activityLog.create({
        data: {
          memberId, actor: actorFromSession(guard.user), action: "Indicator Granted",
          description: `${indicator.name} manually granted, expires ${expiresAt.toISOString().slice(0, 10)} (${qualifiedLots.toFixed(2)} / ${requiredLots.toFixed(2)} lots for ${window.period}).`,
        },
      });
      await bumpDataVersion();
      return NextResponse.json({
        ok: true, indicatorAccess: toIndicatorAccessDto(indicator.name, access),
        renewal: { renewed: false, qualifiedLots, requiredLots, period: window.period, origin: "manual" },
      });
    }

    // Expired record → re-grant as a NEW cycle, counted as a renewal.
    const startsAt = now;
    const expiresAt = parseDate(body.expiresAt ?? body.expiryDate) || addMonths(startsAt, settings.renewalMonths);
    const access = await prisma.memberIndicatorAccess.update({
      where: { id: dup.id },
      data: { status: status === IndicatorAccessStatus.suspended ? IndicatorAccessStatus.active : status, source, startsAt, expiresAt, lastRenewedAt: now },
    });
    await prisma.renewalRecord.create({
      data: {
        memberId, indicatorId: indicator.id, indicatorAccessId: access.id,
        period: window.period, qualifiedLots, requiredLots, renewed: true,
        origin: "manual", note: lotsNote ?? "Manual re-grant after expiry",
        oldExpiry: dup.expiresAt, newExpiry: expiresAt,
      },
    });
    await prisma.activityLog.create({
      data: {
        memberId, actor: actorFromSession(guard.user), action: "Indicator Renewed",
        description: `${indicator.name} manually re-granted after expiry (${day(dup.expiresAt)}); new expiry ${expiresAt.toISOString().slice(0, 10)} (${qualifiedLots.toFixed(2)} / ${requiredLots.toFixed(2)} lots for ${window.period}).`,
      },
    });
    await bumpDataVersion();
    return NextResponse.json({
      ok: true, indicatorAccess: toIndicatorAccessDto(indicator.name, access),
      renewal: { renewed: true, qualifiedLots, requiredLots, period: window.period, origin: "manual" },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to grant indicator access" }, { status: 400 });
  }
}
