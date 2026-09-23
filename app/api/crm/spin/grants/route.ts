import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { becBalance } from "@/lib/server/spin";
import { adminGuard, adminWriteGuard, actorFromSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Safety cap per grant — a typo'd extra zero shouldn't mint millions. */
const MAX_GRANT_POINTS = 100_000;

/* Manual BEC grants (admin test tool + goodwill adjustments). A grant is a
   BecGrant row with lots 0, so it adds straight to the earned side of
   becBalance() without touching trade logs, lots, rebates or renewals. */

/** Recent manual grants, newest first — so the team can see who got what. */
export async function GET() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const rows = await getPrisma().becGrant.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { member: { select: { code: true, name: true, displayName: true } } },
    });
    return NextResponse.json({
      ok: true,
      grants: rows.map((row) => ({
        id: row.id,
        memberId: row.memberId,
        memberCode: row.member.code,
        memberName: row.member.displayName?.trim() || row.member.name,
        points: row.points.toNumber(),
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load BEC grants" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const memberId = Math.floor(Number(body?.memberId));
    const points = Number(body?.points);
    const note = String(body?.note || "").trim().slice(0, 500);
    if (!Number.isInteger(memberId) || memberId <= 0) {
      return NextResponse.json({ ok: false, error: "Pick a member first", code: "member_required" }, { status: 400 });
    }
    if (!Number.isFinite(points) || points <= 0) {
      return NextResponse.json({ ok: false, error: "Points must be more than 0", code: "points_invalid" }, { status: 400 });
    }
    if (points > MAX_GRANT_POINTS) {
      return NextResponse.json({ ok: false, error: `One grant is capped at ${MAX_GRANT_POINTS.toLocaleString("en-US")} BEC`, code: "points_capped" }, { status: 400 });
    }

    const prisma = getPrisma();
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, code: true, name: true, displayName: true },
    });
    if (!member) {
      return NextResponse.json({ ok: false, error: "Member not found", code: "member_not_found" }, { status: 404 });
    }

    const actor = actorFromSession(guard.user);
    const grant = await prisma.becGrant.create({
      data: { memberId, lots: 0, points, note: note || `Manual grant by ${actor}` },
    });
    await prisma.activityLog.create({
      data: {
        memberId,
        actor,
        action: "BEC Granted",
        description: `${points} BEC → ${member.displayName?.trim() || member.name} (${member.code}).${note ? ` Note: ${note}.` : ""}`,
      },
    });
    const balance = await becBalance(memberId);
    return NextResponse.json({
      ok: true,
      grant: { id: grant.id, memberId, points, note: grant.note, createdAt: grant.createdAt.toISOString() },
      balance,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to grant BEC" }, { status: 400 });
  }
}
