import { RecordStatus } from "@/generated/prisma/client";
import { fetchAccountLotCheck } from "./lotCheck";
import { readGeneralSettings } from "./generalSettings";
import { readIndicatorAutomationSettings } from "./indicatorSettings";
import { getPrisma } from "./prisma";
import {
  currentMonthIso,
  lotWindowForPeriod,
  normalizeCountMode,
  qualify,
  selectAccountsToCount,
  snapshotMatchesWindow,
  type LotPeriod,
  type LotWindow,
} from "../lotEngine";
import { verifyTradeId, type TradeVerification } from "./tradeVerification";

export type { LotPeriod, LotWindow, TradeVerification };

const FANOUT_CONCURRENCY = 10;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, worker));
  return results;
}

export type AccountLot = { accountId: number; tradeId: string; lots: number };

/** Sum live webhook lots for a set of tradeIds over an explicit window. */
export async function sumTradeIds(
  tradeIds: string[],
  from: string,
  to: string,
): Promise<{ total: number; byTradeId: Record<string, number> }> {
  const unique = [...new Set(tradeIds.map((id) => id.trim()).filter(Boolean))];
  const byTradeId: Record<string, number> = {};
  await mapWithConcurrency(unique, FANOUT_CONCURRENCY, async (tradeId) => {
    const data = await fetchAccountLotCheck(from, to, tradeId);
    byTradeId[tradeId] = data.totalLots;
  });
  return { total: unique.reduce((sum, id) => sum + (byTradeId[id] ?? 0), 0), byTradeId };
}

type MemberLotWindowInput = { crmStartDate?: string; crmExpiryDate?: string };

function isoDay(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString().slice(0, 10) : undefined;
}

function resolveWindow(input: MemberLotWindowInput, period: LotPeriod, now = new Date()): LotWindow {
  const fallback = currentMonthIso(now);
  const cycle = lotWindowForPeriod(input, period, now) ?? fallback;
  return { from: cycle.from, to: cycle.to, period: `${cycle.from}_${cycle.to}` };
}

export type MemberLotsResult = {
  lots: number;
  window: LotWindow;
  byAccount: AccountLot[];
  checkedAt: string;
  requiredLots: number;
  qualified: boolean;
};

/** Live member total over an explicit window (no persistence). Counts EVERY
 *  active account regardless of verification; repeated tradeIds count once. */
export async function getMemberLotsForWindow(
  memberId: number,
  from: string,
  to: string,
): Promise<Omit<MemberLotsResult, "window" | "requiredLots" | "qualified"> & { window: { from: string; to: string } }> {
  const prisma = getPrisma();
  const [member, settings] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        primaryTradeAccountId: true,
        tradeAccounts: {
          where: { status: RecordStatus.active },
          select: { id: true, tradeId: true, status: true },
        },
      },
    }),
    readGeneralSettings(),
  ]);
  if (!member) throw new Error("Member not found");
  const mode = normalizeCountMode(settings.lotCalculationMode);
  const targets = selectAccountsToCount(
    member.tradeAccounts.map((a) => ({ id: a.id, tradeId: a.tradeId, status: a.status })),
    mode,
    member.primaryTradeAccountId,
  );
  const { total, byTradeId } = await sumTradeIds(targets.map((a) => a.tradeId), from, to);
  return {
    lots: total,
    window: { from, to },
    byAccount: targets.map((a) => ({ accountId: a.id, tradeId: a.tradeId, lots: byTradeId[a.tradeId.trim()] ?? 0 })),
    checkedAt: new Date().toISOString(),
  };
}

/** Live member total over a named period (default: the current cycle). */
export async function getMemberLots(memberId: number, period: LotPeriod = "cycle"): Promise<MemberLotsResult> {
  const prisma = getPrisma();
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      crmStartDate: true,
      crmExpiryDate: true,
      requiredLotsOverride: true,
    },
  });
  if (!member) throw new Error("Member not found");
  const window = resolveWindow(
    { crmStartDate: isoDay(member.crmStartDate), crmExpiryDate: isoDay(member.crmExpiryDate) },
    period,
  );
  const live = await getMemberLotsForWindow(memberId, window.from, window.to);
  const automation = await readIndicatorAutomationSettings();
  const requiredLots = member.requiredLotsOverride?.toNumber() ?? automation.requiredLots;
  return {
    lots: live.lots,
    window,
    byAccount: live.byAccount,
    checkedAt: live.checkedAt,
    requiredLots,
    qualified: qualify(live.lots, requiredLots),
  };
}

/** Live total + persist the window stamp so list/detail converge. */
export async function snapshotMemberLots(
  memberId: number,
  period: LotPeriod = "cycle",
): Promise<{ lots: number; window: LotWindow }> {
  const live = await getMemberLots(memberId, period);
  await getPrisma().member.update({
    where: { id: memberId },
    data: {
      currentPeriodLots: live.lots,
      currentPeriodLotsAt: new Date(),
      currentPeriodLotsFrom: new Date(`${live.window.from}T00:00:00Z`),
      currentPeriodLotsTo: new Date(`${live.window.to}T00:00:00Z`),
    },
  });
  return { lots: live.lots, window: live.window };
}

export type LotSummary = {
  lots: number;
  required: number;
  qualified: boolean;
  stale: boolean;
  from: string;
  to: string;
  asOf?: string;
};

type SummaryMemberRow = {
  id: number;
  crmStartDate?: string | null;
  crmExpiryDate?: string | null;
  requiredLotsOverride?: number | null;
  currentPeriodLots?: number | null;
  currentPeriodLotsAt?: string | null;
  currentPeriodLotsFrom?: string | null;
  currentPeriodLotsTo?: string | null;
};

/** Snapshot-only summary: trusts the persisted snapshot ONLY when its stamped
 *  window matches the member's current cycle window. Never falls back to
 *  ledger math — a miss surfaces as `stale: true` with a refresh action. */
export function readLotSummary(
  member: SummaryMemberRow,
  requiredDefault: number,
  now = new Date(),
): LotSummary {
  const window = resolveWindow(
    {
      crmStartDate: member.crmStartDate ?? undefined,
      crmExpiryDate: member.crmExpiryDate ?? undefined,
    },
    "cycle",
    now,
  );
  const required = member.requiredLotsOverride ?? requiredDefault;
  const fresh =
    member.currentPeriodLots != null &&
    snapshotMatchesWindow(
      { from: member.currentPeriodLotsFrom, to: member.currentPeriodLotsTo },
      window,
    );
  const lots = fresh ? Number(member.currentPeriodLots) : Number(member.currentPeriodLots ?? 0);
  return {
    lots,
    required,
    qualified: qualify(lots, required),
    stale: !fresh,
    from: window.from,
    to: window.to,
    asOf: member.currentPeriodLotsAt ?? undefined,
  };
}

/** Batch summaries for the members list + overview counts (no webhooks). */
export function summarizeMembers<T extends SummaryMemberRow>(
  members: T[],
  requiredDefault: number,
  now = new Date(),
): { summaries: Record<number, LotSummary>; qualified: number; notQualified: number } {
  const summaries: Record<number, LotSummary> = {};
  let qualified = 0;
  for (const member of members) {
    const summary = readLotSummary(member, requiredDefault, now);
    summaries[member.id] = summary;
    if (summary.qualified) qualified += 1;
  }
  return { summaries, qualified, notQualified: members.length - qualified };
}

/** Webhook preview for a Trade ID (no persistence) — used by the member
 *  lookup when the ID isn't found locally. */
export async function previewTradeId(tradeId: string): Promise<TradeVerification> {
  return verifyTradeId(tradeId);
}
