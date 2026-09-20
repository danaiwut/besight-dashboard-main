import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toRewardClaimDto } from "@/lib/server/crmDtos";
import { actorFromSession, adminWriteGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "fulfilled", "cancelled"] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid claim id" }, { status: 400 });
    const body = await request.json() as Record<string, unknown>;
    const prisma = getPrisma();
    const current = await prisma.rewardClaim.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!current) return NextResponse.json({ ok: false, error: "Claim not found" }, { status: 404 });
    const data: { status?: string; note?: string | null; decidedAt?: Date | null } = {};
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) {
        return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
      }
      data.status = body.status as string;
      data.decidedAt = body.status === "pending" ? null : new Date();
    }
    if (body.note !== undefined) data.note = String(body.note || "").trim() || null;
    const claim = await prisma.rewardClaim.update({
      where: { id },
      data,
      include: { member: { select: { code: true, name: true, displayName: true } }, activity: { select: { title: true } } },
    });
    await prisma.activityLog.create({
      data: {
        memberId: claim.memberId,
        actor: actorFromSession(guard.user),
        action: claim.status === "fulfilled" ? "Reward Fulfilled" : claim.status === "cancelled" ? "Reward Cancelled" : "Reward Reopened",
        description: `"${claim.title}" → ${claim.status}.${claim.note ? ` Note: ${claim.note}.` : ""}`,
      },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, claim: toRewardClaimDto(claim) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update claim" }, { status: 400 });
  }
}
