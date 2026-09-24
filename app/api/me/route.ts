import { NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { memberGuard } from "@/lib/session";
import { toIndicatorAccessDto, toIndicatorDto, toMemberDto, toTelegramAccessDto, toTradeAccountDto, toRenewalRecordDto, toBrokerDto } from "@/lib/server/crmDtos";
import { readIndicatorAutomationSettings } from "@/lib/server/indicatorSettings";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";

export const dynamic = "force-dynamic";

/** Everything the signed-in member's dashboard needs — scoped strictly to their
 *  own rows, resolved from the session (never a query param). An admin whose
 *  email also owns a member row sees that member's dashboard; other admins get
 *  a 404 here and use the /api/crm endpoints instead. */
export async function GET() {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;

  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const memberId = await resolveMemberIdForUser(guard.user);
  if (!memberId) {
    return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });
  }

  try {
    const prisma = getPrisma();
    const [member, tradeLogs, access, telegram, renewals, brokers, indicatorRecords, entitlements, automation, top] = await Promise.all([
      prisma.member.findUnique({ where: { id: memberId }, include: { acquisitionChannels: true, tradeAccounts: true } }),
      prisma.tradeLog.findMany({ where: { memberId }, orderBy: { tradeDate: "desc" }, take: 5000 }),
      prisma.memberIndicatorAccess.findMany({ where: { memberId }, include: { indicator: true }, orderBy: { expiresAt: "desc" } }),
      prisma.telegramAccess.findMany({ where: { memberId }, orderBy: { id: "asc" } }),
      prisma.renewalRecord.findMany({ where: { memberId }, include: { indicator: true }, orderBy: { createdAt: "desc" }, take: 200 }),
      // Broker + indicator catalogs are non-sensitive reference data.
      prisma.broker.findMany({ orderBy: { id: "asc" } }),
      prisma.indicator.findMany({ where: { status: "active" }, orderBy: { id: "asc" } }),
      // Same plan → indicator entitlements the CRM admin configures, so the
      // dashboard's Free/Premium classification can't drift from the CRM.
      prisma.planIndicatorEntitlement.findMany(),
      readIndicatorAutomationSettings(),
      // Current-period leaderboard from the persisted per-member lots (real
      // numbers; no PII beyond the public display name + country).
      prisma.member.findMany({
        where: { currentPeriodLots: { gt: 0 } },
        orderBy: { currentPeriodLots: "desc" },
        take: 20,
        select: { id: true, name: true, displayName: true, country: true, currentPeriodLots: true },
      }),
    ]);

    const planEntitlements: { free: number[]; ib_partner: number[] } = { free: [], ib_partner: [] };
    for (const entitlement of entitlements) planEntitlements[entitlement.plan].push(entitlement.indicatorId);

    if (!member) return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });

    // Accounts the CRM sync created stay hidden until the member confirms them
    // as their own — the dashboard shows only confirmed accounts and their logs.
    const confirmedAccounts = member.tradeAccounts.filter((a) => a.memberConfirmed);
    const pendingAccounts = member.tradeAccounts.filter((a) => !a.memberConfirmed);
    const confirmedIds = new Set(confirmedAccounts.map((a) => a.id));
    const memberDto = toMemberDto(member);
    if (confirmedAccounts.length === 0) {
      // Nothing claimed yet — don't surface a period total that came from
      // accounts the member hasn't confirmed.
      memberDto.currentPeriodLots = 0;
      memberDto.currentPeriodLotsAt = undefined;
    }


    return NextResponse.json({
      ok: true,
      member: memberDto,
      // Once the member has passed the identity check, the dashboard stops
      // prompting them — the saved TV/email is returned so it can stay hidden.
      // Claiming/adding any trade account requires the check, so a confirmed
      // account is itself proof and keeps older members from being re-asked.
      identity: (member.identityVerifiedAt || confirmedAccounts.length > 0) && member.tradingView && member.email
        ? { tradingView: member.tradingView, email: member.email }
        : null,
      tradeAccounts: confirmedAccounts.map(toTradeAccountDto),
      pendingTradeAccounts: pendingAccounts.map(toTradeAccountDto),
      tradeLogs: tradeLogs
        .filter((row) => confirmedIds.has(row.tradeAccountId))
        .map((row) => ({
        id: Number(row.id),
        tradeAccountId: row.tradeAccountId,
        memberId: row.memberId,
        symbol: row.symbol,
        lots: row.lots.toNumber(),
        rebate: row.rebate.toNumber(),
        tradeDate: row.tradeDate.toISOString().slice(0, 10),
      })),
      indicatorAccess: access.map((a) => toIndicatorAccessDto(a.indicator.name, a)),
      telegramAccess: telegram.map(toTelegramAccessDto),
      renewalHistory: renewals.map((r) => toRenewalRecordDto(r.indicator.name, r)),
      indicators: indicatorRecords.map(toIndicatorDto),
      planEntitlements,
      brokers: brokers.map(toBrokerDto),
      settings: {
        requiredLots: automation.requiredLots,
        renewalPeriodMonths: automation.renewalMonths,
        autoRenewalEnabled: automation.enabled,
      },
      leaderboard: top.map((m, index) => ({
        rank: index + 1,
        memberId: m.id,
        name: m.displayName?.trim() || m.name,
        country: m.country || undefined,
        lots: m.currentPeriodLots.toNumber(),
      })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load your data" }, { status: 500 });
  }
}
