import { NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { refreshActivityScores } from "@/lib/server/activityScoring";
import { adminWriteGuard } from "@/lib/session";


export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Recomputes every registration's lots for one activity over its window only
 *  (start → min(end, today)). Writes to ActivityEnrollment, never to CRM. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid activity id" }, { status: 400 });
    const activity = await getPrisma().activity.findUnique({ where: { id }, select: { id: true } });
    if (!activity) return NextResponse.json({ ok: false, error: "Activity not found" }, { status: 404 });

    const result = await refreshActivityScores(id);
    await bumpDataVersion();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to refresh scores" }, { status: 500 });
  }
}
