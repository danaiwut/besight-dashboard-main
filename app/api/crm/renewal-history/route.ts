import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { toRenewalRecordDto } from "@/lib/server/crmDtos";
import { adminGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberIdRaw = request.nextUrl.searchParams.get("memberId");
    const memberId = memberIdRaw == null || memberIdRaw === "" ? null : Number(memberIdRaw);
    if (memberId !== null && (!Number.isInteger(memberId) || memberId <= 0)) {
      return NextResponse.json({ ok: false, error: "Invalid memberId" }, { status: 400 });
    }
    const records = await getPrisma().renewalRecord.findMany({
      where: memberId ? { memberId } : undefined,
      include: { indicator: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return NextResponse.json({
      ok: true,
      renewalHistory: records.map((record) => toRenewalRecordDto(record.indicator.name, record)),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load renewal history" }, { status: 500 });
  }
}
