import { NextRequest, NextResponse } from "next/server";
import { snapshotMemberLots } from "@/lib/server/memberLotsSync";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { cronGuard } from "@/lib/session";
import { bumpDataVersion } from "@/lib/server/dataVersion";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const guard = cronGuard(request);
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  }

  const result = await snapshotMemberLots();
  await bumpDataVersion();
  return NextResponse.json({ ok: true, ...result });
}
