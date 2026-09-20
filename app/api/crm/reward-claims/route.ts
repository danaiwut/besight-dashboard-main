import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toRewardClaimDto } from "@/lib/server/crmDtos";
import { adminGuard, adminWriteGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "fulfilled", "cancelled"] as const;
const KINDS = ["tier", "competition", "manual"] as const;

/** The shared fulfilment queue — every tier claim, competition prize and
 *  manual grant lands here for the admin to fulfil in one place. */
export async function GET(request: NextRequest) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const params = request.nextUrl.searchParams;
    const status = params.get("status") || "";
    const kind = params.get("kind") || "";
    const query = params.get("q")?.trim() || "";
    const limit = Math.min(500, Math.max(1, Number(params.get("limit")) || 200));
    const prisma = getPrisma();
    const memberIds = query
      ? (await prisma.member.findMany({
          where: { OR: [{ name: { contains: query } }, { code: { contains: query } }, { email: { contains: query } }] },
          select: { id: true },
          take: 100,
        })).map((m) => m.id)
      : null;
    const rows = await prisma.rewardClaim.findMany({
      where: {
        ...(STATUSES.includes(status as (typeof STATUSES)[number]) ? { status } : {}),
        ...(KINDS.includes(kind as (typeof KINDS)[number]) ? { kind } : {}),
        ...(memberIds ? { memberId: { in: memberIds.length ? memberIds : [-1] } } : {}),
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      include: { member: { select: { code: true, name: true, displayName: true } }, activity: { select: { title: true } } },
    });
    const summary = await prisma.rewardClaim.groupBy({ by: ["status"], _count: { status: true } });
    return NextResponse.json({
      ok: true,
      claims: rows.map(toRewardClaimDto),
      summary: Object.fromEntries(summary.map((row) => [row.status, row._count.status])),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load claims" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const memberId = Number(body.memberId);
    if (!Number.isInteger(memberId) || memberId <= 0) return NextResponse.json({ ok: false, error: "memberId is required" }, { status: 400 });
    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });
    const prisma = getPrisma();
    const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } });
    if (!member) return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });
    try {
      const claim = await prisma.rewardClaim.create({
        data: {
          memberId,
          kind: "manual",
          refKey: `manual:${Date.now().toString(36)}:${Math.floor(Math.random() * 1e6)}`,
          title,
          detail: String(body.detail || "").trim() || null,
          note: String(body.note || "").trim() || null,
        },
        include: { member: { select: { code: true, name: true, displayName: true } }, activity: { select: { title: true } } },
      });
      await bumpDataVersion();
      return NextResponse.json({ ok: true, claim: toRewardClaimDto(claim) });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
        return NextResponse.json({ ok: false, error: "รางวัลนี้ถูกสร้างให้สมาชิกแล้ว" }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to create claim" }, { status: 400 });
  }
}
