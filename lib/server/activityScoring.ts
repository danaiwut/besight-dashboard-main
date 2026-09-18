import type { AccountKind } from "../activities";
import { getPrisma, isDatabaseConfigured } from "./prisma";
import { fetchAccountLotCheck } from "./lotCheck";

/* ── Activity (competition) scoring ──
   Counts lots for each registration over the ACTIVITY WINDOW ONLY — from the
   activity's start date to min(end date, today) — and stores the result on the
   enrollment row. It never reads or writes the CRM's member lot totals, trade
   logs, rebates, or indicator access, so a competition can never change a
   member's CRM standing. */

/** Demo accounts need their own lot provider. Until one is configured, a demo
 *  registration stays at 0 with this note instead of being silently counted
 *  as if it were a live IB account (which would produce wrong standings). */
export const DEMO_SOURCE_NOTE = "ยังไม่ได้ตั้งค่าแหล่งข้อมูล lot สำหรับบัญชี demo";

/** The counting window for an activity: start date → min(end date, now), so a
 *  running competition never counts lots from after the window closes. */
export function activityWindow(activity: { startDate: Date; endDate: Date }, now = new Date()) {
  const start = activity.startDate.toISOString().slice(0, 10);
  const endCandidate = activity.endDate.getTime() < now.getTime() ? activity.endDate : now;
  const end = endCandidate.toISOString().slice(0, 10);
  return { from: start, to: end < start ? start : end };
}

/** Live accounts are counted through the BeSight lot webhook (the same source
 *  the CRM uses, but queried for the activity window only). */
async function fetchWindowLots(tradeId: string, from: string, to: string): Promise<number> {
  const data = await fetchAccountLotCheck(from, to, tradeId);
  return data.totalLots;
}

export type AccountVerification = { verified: boolean; note?: string };

/** Widest practical lookback for the live/demo check — same 12-month horizon
 *  the Trade ID verification uses, so "known to the BeSight campaign data"
 *  means the same thing everywhere. */
const CLASSIFY_LOOKBACK_MONTHS = 12;

/** Classifies a competition account. A number that appears in the BeSight IB
 *  campaign lots is a REAL account; one that does not is treated as a demo
 *  account. "unknown" means the check itself failed (webhook outage) — callers
 *  decide whether to allow the registration and re-check later.
 *  Caveat: a real account that has never traded is indistinguishable from a
 *  demo account until a demo data source exists. */
export async function classifyCompetitionAccount(tradeId: string): Promise<AccountKind> {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - CLASSIFY_LOOKBACK_MONTHS, now.getUTCDate()));
  try {
    const data = await fetchAccountLotCheck(from.toISOString().slice(0, 10), now.toISOString().slice(0, 10), tradeId);
    return data.account.length > 0 ? "live" : "demo";
  } catch {
    return "unknown";
  }
}

/** Human-readable Thai summary for an account classification. */
export function accountKindMessage(kind: AccountKind): string {
  switch (kind) {
    case "live":
      return "บัญชีนี้เป็นบัญชีจริง (พบในระบบเทรดของ BeSight) — กิจกรรมนี้ใช้ได้เฉพาะบัญชี demo";
    case "demo":
      return "ไม่พบบัญชีนี้ในระบบเทรดจริง — ใช้ลงทะเบียนเป็นบัญชี demo ได้ (รอตรวจสอบอีกครั้ง)";
    default:
      return "ยังตรวจประเภทบัญชีไม่ได้ในขณะนี้ — ลงทะเบียนได้ และระบบจะตรวจสอบอีกครั้ง";
  }
}

/** Verifies a competition account number exists for this activity window.
 *  A linked CRM account is already verified; anything else is checked against
 *  the lot webhook over the window. Demo accounts cannot be verified yet. */
export async function verifyCompetitionAccount(tradeId: string, window: { from: string; to: string }, isDemo: boolean): Promise<AccountVerification> {
  if (isDemo) return { verified: false, note: DEMO_SOURCE_NOTE };
  try {
    const lots = await fetchWindowLots(tradeId, window.from, window.to);
    return lots > 0
      ? { verified: true }
      : { verified: false, note: `ไม่พบการเทรดของบัญชีนี้ในช่วง ${window.from} – ${window.to}` };
  } catch (error) {
    return { verified: false, note: error instanceof Error ? error.message : "ตรวจสอบบัญชีไม่สำเร็จ" };
  }
}

const CONCURRENCY = 10;

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Recomputes lots for every registration of the given activity (or every
 *  running/finished activity when none is given) and persists the snapshot +
 *  window on the enrollment row. Safe to run repeatedly — it is a replace, not
 *  an increment, so a webhook retry can never double-count. */
export async function refreshActivityScores(activityId?: number) {
  if (!isDatabaseConfigured()) return { activities: 0, updated: 0, failed: 0, skipped: "DATABASE_URL is not configured" };
  const prisma = getPrisma();
  const activities = await prisma.activity.findMany({
    where: activityId ? { id: activityId } : { status: { in: ["live", "finished"] } },
    select: { id: true, startDate: true, endDate: true },
  });

  let updated = 0;
  let failed = 0;
  for (const activity of activities) {
    const { from, to } = activityWindow(activity);
    const enrollments = await prisma.activityEnrollment.findMany({
      where: { activityId: activity.id },
      select: { id: true, tradeId: true, isDemo: true },
    });
    await mapWithConcurrency(enrollments, CONCURRENCY, async (enrollment) => {
      const now = new Date();
      const windowData = { lotsFrom: new Date(`${from}T00:00:00Z`), lotsTo: new Date(`${to}T00:00:00Z`), lotsAt: now };
      if (!enrollment.tradeId) {
        await prisma.activityEnrollment.update({ where: { id: enrollment.id }, data: { lots: 0, ...windowData, checkError: "ไม่มีเลขบัญชีที่ใช้แข่ง" } });
        return;
      }
      if (enrollment.isDemo) {
        // Structure is ready; the demo provider is still to be wired.
        await prisma.activityEnrollment.update({ where: { id: enrollment.id }, data: { lots: 0, ...windowData, checkError: DEMO_SOURCE_NOTE } });
        return;
      }
      try {
        const lots = await fetchWindowLots(enrollment.tradeId, from, to);
        await prisma.activityEnrollment.update({ where: { id: enrollment.id }, data: { lots, ...windowData, checkError: null } });
        updated += 1;
      } catch (error) {
        failed += 1;
        await prisma.activityEnrollment.update({
          where: { id: enrollment.id },
          data: { ...windowData, checkError: error instanceof Error ? error.message : "ตรวจสอบ lot ไม่สำเร็จ" },
        });
      }
    });
  }
  return { activities: activities.length, updated, failed };
}
