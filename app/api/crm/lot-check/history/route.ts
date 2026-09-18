import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { adminGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Audit history of lot checks (LotCheckRun rows, newest first).
 *  Filters: `?memberId=` `?tradeId=` `?limit=` (default 50, max 200). */
export async function GET(request: NextRequest) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const params = request.nextUrl.searchParams;
    const memberId = Number(params.get("memberId"));
    const tradeId = params.get("tradeId")?.trim() || undefined;
    const limit = Math.min(200, Math.max(1, Number(params.get("limit")) || 50));
    const runs = await getPrisma().lotCheckRun.findMany({
      where: {
        ...(Number.isInteger(memberId) && memberId > 0 ? { memberId } : {}),
        ...(tradeId ? { tradeId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        memberId: true,
        tradeAccountId: true,
        tradeId: true,
        dateFrom: true,
        dateTo: true,
        totalLots: true,
        qualified: true,
        autoProcessed: true,
        errorMessage: true,
        createdAt: true,
        member: { select: { code: true, name: true } },
        _count: { select: { results: true } },
      },
    });
    return NextResponse.json({
      ok: true,
      runs: runs.map((run) => ({
        id: run.id.toString(),
        memberId: run.memberId,
        memberCode: run.member?.code ?? null,
        memberName: run.member?.name ?? null,
        tradeAccountId: run.tradeAccountId,
        tradeId: run.tradeId,
        dateFrom: run.dateFrom.toISOString().slice(0, 10),
        dateTo: run.dateTo.toISOString().slice(0, 10),
        totalLots: run.totalLots.toNumber(),
        qualified: run.qualified,
        autoProcessed: run.autoProcessed,
        errorMessage: run.errorMessage,
        resultCount: run._count.results,
        createdAt: run.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load lot history" }, { status: 500 });
  }
}
