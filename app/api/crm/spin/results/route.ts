import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { toSpinResultDto } from "@/lib/server/spin";
import { adminGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "fulfilled", "cancelled"] as const;

/** Spin history for the CRM, newest first, with a small status summary. */
export async function GET(request: NextRequest) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const params = request.nextUrl.searchParams;
    const status = params.get("status") || "";
    const limit = Math.min(500, Math.max(1, Math.floor(Number(params.get("limit")) || 100)));
    const prisma = getPrisma();

    const where = STATUSES.includes(status as (typeof STATUSES)[number]) ? { status: status as (typeof STATUSES)[number] } : {};
    const [rows, pending, fulfilled, cancelled] = await Promise.all([
      prisma.spinResult.findMany({
        where,
        orderBy: { spunAt: "desc" },
        take: limit,
        include: { prize: true, member: { select: { code: true, name: true, displayName: true } } },
      }),
      prisma.spinResult.count({ where: { status: "pending" } }),
      prisma.spinResult.count({ where: { status: "fulfilled" } }),
      prisma.spinResult.count({ where: { status: "cancelled" } }),
    ]);

    return NextResponse.json({
      ok: true,
      results: rows.map(toSpinResultDto),
      summary: { pending, fulfilled, cancelled, total: pending + fulfilled + cancelled },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load spin results" }, { status: 500 });
  }
}
