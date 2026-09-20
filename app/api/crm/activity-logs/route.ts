import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { actorFromSession, adminGuard, adminWriteGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 500, 1), 2000);
    const records = await getPrisma().activityLog.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { member: { select: { name: true } } },
    });
    return NextResponse.json({ ok: true, activityLogs: records.map((record) => ({
      id: Number(record.id),
      timestamp: record.createdAt.toISOString(),
      actor: record.actor,
      memberId: record.memberId || undefined,
      memberName: record.member?.name || undefined,
      action: record.action,
      description: record.description,
    })) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load activity logs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json() as { memberId?: number; action?: string; description?: string };
    if (!body.action?.trim() || !body.description?.trim()) {
      return NextResponse.json({ ok: false, error: "action and description are required" }, { status: 400 });
    }
    const record = await getPrisma().activityLog.create({
      data: {
        // Never from the request body: an audit trail the caller can label with
        // someone else's name records nothing worth having.
        actor: actorFromSession(guard.user),
        memberId: body.memberId || null,
        action: body.action.trim(),
        description: body.description.trim(),
        notification: true,
      },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, id: Number(record.id) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save activity log" }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json() as { id?: number; all?: boolean };
    const data = { notificationReadAt: new Date() };
    if (body.all) {
      await getPrisma().activityLog.updateMany({ where: { notification: true, notificationReadAt: null }, data });
    } else if (body.id) {
      await getPrisma().activityLog.update({ where: { id: BigInt(body.id) }, data });
    } else {
      return NextResponse.json({ ok: false, error: "id or all is required" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update notification" }, { status: 400 });
  }
}
