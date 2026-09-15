import {
  AccessSource,
  IndicatorAccessStatus,
  LotCheckKind,
  RecordStatus,
} from "@/generated/prisma/client";
import type { LotAccountRow, LotCampaignRow, LotCountryRow, LotExcludedSymbolRow } from "./lotCheck";
import { getPrisma, isDatabaseConfigured } from "./prisma";
import { readIndicatorAutomationSettings } from "./indicatorSettings";

type LotData = {
  account: LotAccountRow[];
  campaigns: LotCampaignRow[];
  countries: LotCountryRow[];
  excludedSymbols: LotExcludedSymbolRow[];
  totalLots: number;
};

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

export async function persistLotCheckAndAutomate(input: {
  tradeId?: string;
  dateFrom: string;
  dateTo: string;
  data: LotData;
  autoGrant: boolean;
  period?: string;
  indicatorIds?: number[];
}) {
  if (!isDatabaseConfigured()) {
    return { database: false, linkedMember: null, qualified: null, requiredLots: null, granted: 0, renewed: 0, skipped: "DATABASE_URL is not configured" };
  }

  const prisma = getPrisma();
  const settings = await readIndicatorAutomationSettings();
  return prisma.$transaction(async (tx) => {
    const account = input.tradeId
      ? await tx.tradeAccount.findFirst({ where: { tradeId: input.tradeId }, include: { member: true } })
      : null;
    const requiredLots = account?.member.requiredLotsOverride?.toNumber() ?? settings.requiredLots;
    const qualified = Boolean(account && input.data.totalLots >= requiredLots);
    const run = await tx.lotCheckRun.create({
      data: {
        memberId: account?.memberId,
        tradeAccountId: account?.id,
        tradeId: input.tradeId,
        dateFrom: new Date(`${input.dateFrom}T00:00:00Z`),
        dateTo: new Date(`${input.dateTo}T23:59:59Z`),
        totalLots: input.data.totalLots,
        qualified,
      },
    });

    const results = [
      ...input.data.account.map((row) => ({ runId: run.id, kind: LotCheckKind.account, campaignName: row.campaignName || null, loginId: row.loginId || null, lots: row.lots })),
      ...input.data.campaigns.map((row) => ({ runId: run.id, kind: LotCheckKind.campaign, campaignName: row.campaignName || null, lots: row.lots })),
      ...input.data.countries.map((row) => ({ runId: run.id, kind: LotCheckKind.country, country: row.country || null, lots: row.lots })),
      ...input.data.excludedSymbols.map((row) => ({ runId: run.id, kind: LotCheckKind.excluded_symbol, campaignName: row.campaignName || null, loginId: row.loginId || null, instrument: row.instrument || null, lots: row.lots })),
    ];
    if (results.length) await tx.lotCheckResult.createMany({ data: results });

    let granted = 0;
    let renewed = 0;
    let skipped: string | null = null;
    if (!account) {
      skipped = input.tradeId ? "Trade ID is not linked to a member" : "Trade ID is required for automatic access";
    } else if (!input.autoGrant) {
      skipped = "Automatic Indicator access was disabled for this check";
    } else if (!settings.enabled) {
      skipped = "Automatic Indicator renewal is disabled in settings";
    } else if (!qualified) {
      skipped = `Member has ${input.data.totalLots.toFixed(4)} of ${requiredLots.toFixed(4)} required lots`;
    } else {
      const entitlements = await tx.planIndicatorEntitlement.findMany({
        where: {
          plan: account.member.plan,
          indicator: { status: RecordStatus.active },
          ...(input.indicatorIds?.length ? { indicatorId: { in: input.indicatorIds } } : {}),
        },
        include: { indicator: true },
      });
      if (!entitlements.length) {
        skipped = `No active Indicator entitlement is configured for plan ${account.member.plan}`;
      } else {
        const renewalMonths = settings.renewalMonths;
        const now = new Date();
        const period = input.period || `${input.dateFrom}_${input.dateTo}`;
        for (const entitlement of entitlements) {
          const alreadyProcessed = await tx.renewalRecord.findUnique({
            where: { memberId_indicatorId_period: { memberId: account.memberId, indicatorId: entitlement.indicatorId, period } },
          });
          if (alreadyProcessed) continue;

          const existing = await tx.memberIndicatorAccess.findUnique({
            where: { memberId_indicatorId: { memberId: account.memberId, indicatorId: entitlement.indicatorId } },
          });
          if (existing?.manualLock || existing?.status === IndicatorAccessStatus.suspended) continue;

          const oldExpiry = existing?.expiresAt || null;
          const baseDate = existing?.status === IndicatorAccessStatus.active && existing.expiresAt > now ? existing.expiresAt : now;
          const newExpiry = addMonths(baseDate, renewalMonths);
          const access = existing
            ? await tx.memberIndicatorAccess.update({
                where: { id: existing.id },
                data: { status: IndicatorAccessStatus.active, source: AccessSource.Plan, expiresAt: newExpiry, lastRenewedAt: now },
              })
            : await tx.memberIndicatorAccess.create({
                data: {
                  memberId: account.memberId,
                  indicatorId: entitlement.indicatorId,
                  status: IndicatorAccessStatus.active,
                  source: AccessSource.Plan,
                  startsAt: now,
                  expiresAt: newExpiry,
                  lastRenewedAt: now,
                },
              });

          await tx.renewalRecord.create({
            data: {
              memberId: account.memberId,
              indicatorId: entitlement.indicatorId,
              indicatorAccessId: access.id,
              period,
              qualifiedLots: input.data.totalLots,
              requiredLots,
              renewed: Boolean(existing),
              oldExpiry,
              newExpiry,
            },
          });
          await tx.activityLog.create({
            data: {
              memberId: account.memberId,
              actor: "System",
              action: existing ? "Indicator Renewed" : "Indicator Granted",
              description: `${entitlement.indicator.name}: ${input.data.totalLots.toFixed(4)} / ${requiredLots.toFixed(4)} lots for ${period}; access expires ${newExpiry.toISOString().slice(0, 10)}.`,
            },
          });
          if (existing) renewed += 1;
          else granted += 1;
        }
      }
    }

    await tx.lotCheckRun.update({ where: { id: run.id }, data: { autoProcessed: Boolean(account && input.autoGrant) } });
    return {
      database: true,
      runId: run.id.toString(),
      linkedMember: account ? { id: account.member.id, code: account.member.code, name: account.member.name } : null,
      qualified,
      requiredLots,
      granted,
      renewed,
      skipped,
    };
  });
}
