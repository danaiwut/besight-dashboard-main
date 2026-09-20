import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { buildNotifications, markNotificationsRead } from "@/lib/server/notifications";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberScopeGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = guard.memberId;
    return NextResponse.json({ ok: true, ...(await buildNotifications(memberId)) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load notifications" }, { status: 500 });
  }
}

/** Dismisses notification keys (`{ keys: [...] }`) — the bell re-derives
 *  everything else on read, so only dismissals persist. */
export async function POST(request: NextRequest) {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = guard.memberId;
    const body = (await request.json().catch(() => ({}))) as { keys?: unknown };
    const keys = Array.isArray(body.keys) ? body.keys.map(String) : [];
    await markNotificationsRead(memberId, keys);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to dismiss" }, { status: 400 });
  }
}
