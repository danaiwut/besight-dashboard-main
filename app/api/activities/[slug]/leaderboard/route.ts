import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberGuard } from "@/lib/session";
import type { ActivityLeaderboardRow, ActivityStanding } from "@/lib/activities";

export const dynamic = "force-dynamic";

const TOP_LIMIT = 100;

/** Standings for one published activity, from the enrollment score snapshots.
 *  Scores come from the activity-window counting job — never from CRM totals. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const { slug } = await params;
    const prisma = getPrisma();
    const activity = await prisma.activity.findFirst({
      where: { slug, published: true, OR: [{ visibleFrom: null }, { visibleFrom: { lte: new Date() } }] },
      select: { id: true },
    });
    if (!activity) return NextResponse.json({ ok: false, error: "Activity not found" }, { status: 404 });

    const memberId = await resolveMemberIdForUser(guard.user);
    const rows = await prisma.activityEnrollment.findMany({
      where: { activityId: activity.id },
      orderBy: [{ lots: "desc" }, { createdAt: "asc" }],
      take: TOP_LIMIT,
      include: { member: { select: { name: true, displayName: true } } },
    });

    const leaderboard: ActivityLeaderboardRow[] = rows.map((row, index) => ({
      rank: index + 1,
      memberName: row.member.displayName?.trim() || row.member.name,
      lots: row.lots.toNumber(),
      isMe: row.memberId === memberId,
    }));

    let me: ActivityStanding = null;
    if (memberId) {
      const mine = await prisma.activityEnrollment.findUnique({
        where: { activityId_memberId: { activityId: activity.id, memberId } },
        select: { lots: true, verifiedAt: true, isDemo: true, verificationNote: true },
      });
      if (mine) {
        // Rank within the full field, not just the returned page.
        const ahead = await prisma.activityEnrollment.count({ where: { activityId: activity.id, lots: { gt: mine.lots } } });
        me = {
          rank: ahead + 1,
          lots: mine.lots.toNumber(),
          verified: Boolean(mine.verifiedAt),
          isDemo: mine.isDemo,
          verificationNote: mine.verificationNote || undefined,
        };
      }
    }

    // Latest snapshot time across the field — the UI shows "updated at".
    const latest = await prisma.activityEnrollment.aggregate({
      where: { activityId: activity.id },
      _max: { lotsAt: true },
    });

    return NextResponse.json({ ok: true, leaderboard, me, updatedAt: latest._max.lotsAt?.toISOString() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load standings" }, { status: 500 });
  }
}
