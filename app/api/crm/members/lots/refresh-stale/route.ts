import { NextResponse } from "next/server";
import { RecordStatus } from "@/generated/prisma/client";
import { resolveLotWindow, snapshotMatchesWindow } from "@/lib/lotEngine";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { snapshotOneMemberLots } from "@/lib/server/memberLotsSync";
import { adminWriteGuard } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH = 15;

/** Refreshes the lot snapshot for members whose CURRENT cycle window no longer
 *  matches the stamped snapshot window (the list would otherwise show a
 *  stale-cycle number with a badge). Small batches so a page load never blocks
 *  on hundreds of webhook calls — repeat calls (or the 4h cron) converge. */
export async function POST() {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const prisma = getPrisma();
    const members = await prisma.member.findMany({
      where: { tradeAccounts: { some: { status: RecordStatus.active } } },
      select: {
        id: true,
        crmStartDate: true,
        crmExpiryDate: true,
        currentPeriodLotsFrom: true,
        currentPeriodLotsTo: true,
        currentPeriodLotsAt: true,
      },
    });
    const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
    const stale = members.filter((member) => {
      if (!member.currentPeriodLotsAt) return true;
      const window = resolveLotWindow(
        {
          crmStartDate: day(member.crmStartDate) ?? undefined,
          crmExpiryDate: day(member.crmExpiryDate) ?? undefined,
        },
        "cycle",
      );
      return !snapshotMatchesWindow(
        { from: day(member.currentPeriodLotsFrom), to: day(member.currentPeriodLotsTo) },
        window,
      );
    });

    const batch = stale.slice(0, BATCH);
    let refreshed = 0;
    for (const member of batch) {
      try {
        await snapshotOneMemberLots(member.id);
        refreshed += 1;
      } catch {
        // a webhook failure leaves the old snapshot; the next call retries
      }
    }
    if (refreshed) await bumpDataVersion();
    return NextResponse.json({ ok: true, refreshed, stale: stale.length, remaining: Math.max(0, stale.length - refreshed) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to refresh lots" }, { status: 500 });
  }
}
