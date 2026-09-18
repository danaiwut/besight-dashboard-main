import { NextRequest, NextResponse } from "next/server";
import { refreshActivityScores } from "@/lib/server/activityScoring";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { isDatabaseConfigured } from "@/lib/server/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Refreshes every running/finished activity's standings from the lot webhook,
 *  counting each registration over its own activity window only. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  }

  const result = await refreshActivityScores();
  await bumpDataVersion();
  return NextResponse.json({ ok: true, ...result });
}
