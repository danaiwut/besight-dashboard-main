import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { toRewardClaimDto } from "@/lib/server/crmDtos";
import { createTierClaim, lifetimeLots } from "@/lib/server/rewardClaims";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The signed-in member's own reward claims (newest first). */
export async function GET() {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = await resolveMemberIdForUser(guard.user);
    if (!memberId) return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });
    const prisma = getPrisma();
    const [rows, lots] = await Promise.all([
      prisma.rewardClaim.findMany({
        where: { memberId },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { member: { select: { code: true, name: true, displayName: true } }, activity: { select: { title: true } } },
      }),
      lifetimeLots(memberId),
    ]);
    return NextResponse.json({ ok: true, claims: rows.map(toRewardClaimDto), lifetimeLots: lots });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load rewards" }, { status: 500 });
  }
}

/** Claims one loyalty tier. The threshold is re-checked server-side from the
 *  trade ledger — the button state in the UI is convenience only. */
export async function POST(request: NextRequest) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = await resolveMemberIdForUser(guard.user);
    if (!memberId) return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });
    const body = await request.json().catch(() => ({})) as { tierKey?: string };
    const tierKey = String(body.tierKey || "").trim();
    if (!tierKey) return NextResponse.json({ ok: false, error: "tierKey is required" }, { status: 400 });
    try {
      const { claim, lots, threshold } = await createTierClaim(memberId, tierKey);
      const full = await getPrisma().rewardClaim.findUnique({
        where: { id: claim.id },
        include: { member: { select: { code: true, name: true, displayName: true } }, activity: { select: { title: true } } },
      });
      return NextResponse.json({ ok: true, claim: toRewardClaimDto(full!), lots, threshold });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
        return NextResponse.json({ ok: false, error: "รับรางวัลขั้นนี้ไปแล้ว", code: "already_claimed" }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "รับรางวัลไม่สำเร็จ" }, { status: 400 });
  }
}
