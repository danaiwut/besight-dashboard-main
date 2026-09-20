import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { finalizeActivity } from "@/lib/server/rewardClaims";
import { adminWriteGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Locks winners for a finished activity and creates one pending RewardClaim
 *  per prize-row winner. Idempotent — safe to re-run after late scores land. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid activity id" }, { status: 400 });
    const result = await finalizeActivity(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to finalize winners" }, { status: 400 });
  }
}
