import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json() as { actor?: string; memberId?: number; action?: string; description?: string };
    if (!body.actor?.trim() || !body.action?.trim() || !body.description?.trim()) {
      return NextResponse.json({ ok: false, error: "actor, action and description are required" }, { status: 400 });
    }
    const record = await getPrisma().activityLog.create({
      data: {
        actor: body.actor.trim(),
        memberId: body.memberId || null,
        action: body.action.trim(),
        description: body.description.trim(),
      },
    });
    return NextResponse.json({ ok: true, id: Number(record.id) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save activity log" }, { status: 400 });
  }
}
