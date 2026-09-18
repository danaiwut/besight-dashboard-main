import { NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { toActivityDto } from "@/lib/server/crmDtos";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Customer-facing list: published activities only (the CRM route returns all),
 *  each flagged with whether the signed-in member has registered. */
export async function GET() {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const prisma = getPrisma();
    const records = await prisma.activity.findMany({
      where: { published: true, OR: [{ visibleFrom: null }, { visibleFrom: { lte: new Date() } }] },
      orderBy: [{ sortOrder: "asc" }, { startDate: "desc" }],
      include: { _count: { select: { enrollments: true } } },
    });
    const memberId = await resolveMemberIdForUser(guard.user);
    const enrolledIds = memberId && records.length
      ? new Set(
          (
            await prisma.activityEnrollment.findMany({
              where: { memberId, activityId: { in: records.map((record) => record.id) } },
              select: { activityId: true },
            })
          ).map((row) => row.activityId),
        )
      : new Set<number>();
    return NextResponse.json({
      ok: true,
      activities: records.map((record) =>
        toActivityDto(record, enrolledIds.has(record.id), !record.registrationOpensAt || record.registrationOpensAt.getTime() <= Date.now()),
      ),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load activities" }, { status: 500 });
  }
}
