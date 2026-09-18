import { getPrisma } from "./prisma";
import { readIndicatorAutomationSettings } from "./indicatorSettings";
import { levelFromMonthlyLots, recentMonthKeys, PREMIUM_MONTHS, type MemberLevel } from "../memberLevel";

/* ── Member level (server) ──
   Derived from the CRM's own trade-log snapshots — never stored, so it can't
   drift from the monthly lots the members actually traded. */

export function levelMonthKeys(now = new Date()): string[] {
  return recentMonthKeys(PREMIUM_MONTHS, now);
}

function monthStart(months: string[]): Date {
  return new Date(`${months[months.length - 1]}-01T00:00:00Z`);
}

/** Level for one member, respecting their per-member required-lots override. */
export async function memberLevelFor(memberId: number, requiredBar?: number): Promise<MemberLevel> {
  const prisma = getPrisma();
  const settings = await readIndicatorAutomationSettings();
  const months = levelMonthKeys();
  const [member, logs] = await Promise.all([
    prisma.member.findUnique({ where: { id: memberId }, select: { requiredLotsOverride: true } }),
    prisma.tradeLog.findMany({ where: { memberId, tradeDate: { gte: monthStart(months) } }, select: { tradeDate: true, lots: true } }),
  ]);
  const bar = requiredBar ?? member?.requiredLotsOverride?.toNumber() ?? settings.requiredLots;
  const monthly: Record<string, number> = {};
  for (const log of logs) {
    const key = log.tradeDate.toISOString().slice(0, 7);
    monthly[key] = (monthly[key] ?? 0) + log.lots.toNumber();
  }
  return levelFromMonthlyLots(monthly, bar, months);
}

/** Levels for many members with two queries total (used by list screens). */
export async function memberLevelsFor(memberIds: number[]): Promise<Map<number, MemberLevel>> {
  const result = new Map<number, MemberLevel>();
  if (!memberIds.length) return result;
  const prisma = getPrisma();
  const settings = await readIndicatorAutomationSettings();
  const months = levelMonthKeys();
  const [members, logs] = await Promise.all([
    prisma.member.findMany({ where: { id: { in: memberIds } }, select: { id: true, requiredLotsOverride: true } }),
    prisma.tradeLog.findMany({
      where: { memberId: { in: memberIds }, tradeDate: { gte: monthStart(months) } },
      select: { memberId: true, tradeDate: true, lots: true },
    }),
  ]);
  const monthlyByMember = new Map<number, Record<string, number>>();
  for (const log of logs) {
    let monthly = monthlyByMember.get(log.memberId);
    if (!monthly) {
      monthly = {};
      monthlyByMember.set(log.memberId, monthly);
    }
    const key = log.tradeDate.toISOString().slice(0, 7);
    monthly[key] = (monthly[key] ?? 0) + log.lots.toNumber();
  }
  for (const member of members) {
    const bar = member.requiredLotsOverride?.toNumber() ?? settings.requiredLots;
    result.set(member.id, levelFromMonthlyLots(monthlyByMember.get(member.id) ?? {}, bar, months));
  }
  return result;
}
