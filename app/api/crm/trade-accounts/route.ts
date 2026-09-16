import { NextRequest, NextResponse } from "next/server";
import { RecordStatus, VerificationStatus } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toTradeAccountDto } from "@/lib/server/crmDtos";

export const dynamic = "force-dynamic";

function fail(error: unknown, fallback: string, status = 400) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : fallback }, { status });
}

const VERIFICATIONS = ["verified", "pending", "not_found"] as const;
const STATUSES = ["active", "inactive"] as const;

async function resolveBrokerId(prisma: ReturnType<typeof getPrisma>, value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  const broker = await prisma.broker.findUnique({ where: { id }, select: { id: true, code: true } });
  return broker;
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const memberId = Number(body.memberId);
    const tradeId = String(body.tradeId || "").trim();
    if (!Number.isInteger(memberId) || memberId <= 0) return NextResponse.json({ ok: false, error: "memberId is required" }, { status: 400 });
    if (!tradeId) return NextResponse.json({ ok: false, error: "tradeId is required" }, { status: 400 });

    const prisma = getPrisma();
    const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } });
    if (!member) return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });
    // Unknown broker ids degrade to "no broker" instead of failing — the CRM
    // keeps demo broker rows that may not exist in the database.
    const broker = await resolveBrokerId(prisma, body.brokerId);

    const verification = VERIFICATIONS.includes(body.verification as (typeof VERIFICATIONS)[number])
      ? body.verification as VerificationStatus
      : VerificationStatus.pending;
    const status = STATUSES.includes(body.status as (typeof STATUSES)[number])
      ? body.status as RecordStatus
      : RecordStatus.active;

    const account = await prisma.tradeAccount.create({
      data: {
        memberId,
        brokerId: broker?.id ?? null,
        tradeId,
        accountType: String(body.accountType || "").trim() || "Standard",
        partnerIb: String(body.partnerIb || "").trim() || broker?.code || null,
        verification,
        status,
        lastSyncAt: new Date(),
      },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, tradeAccount: toTradeAccountDto(account) });
  } catch (error) {
    return fail(error, "Unable to create trade account");
  }
}
