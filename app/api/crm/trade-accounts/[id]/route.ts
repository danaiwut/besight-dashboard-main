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

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid trade account id" }, { status: 400 });
    const prisma = getPrisma();
    const current = await prisma.tradeAccount.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ ok: false, error: "Trade account not found" }, { status: 404 });

    const body = await request.json() as Record<string, unknown>;
    const data: Record<string, unknown> = { lastSyncAt: new Date() };
    if (body.memberId !== undefined) {
      const memberId = Number(body.memberId);
      if (!Number.isInteger(memberId) || memberId <= 0) return NextResponse.json({ ok: false, error: "Invalid memberId" }, { status: 400 });
      const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } });
      if (!member) return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });
      data.memberId = memberId;
    }
    if (body.brokerId !== undefined) {
      const brokerId = Number(body.brokerId);
      if (!Number.isInteger(brokerId) || brokerId <= 0) {
        data.brokerId = null;
      } else {
        const broker = await prisma.broker.findUnique({ where: { id: brokerId }, select: { id: true } });
        data.brokerId = broker ? brokerId : null;
      }
    }
    if (body.tradeId !== undefined) {
      const tradeId = String(body.tradeId).trim();
      if (!tradeId) return NextResponse.json({ ok: false, error: "tradeId is required" }, { status: 400 });
      data.tradeId = tradeId;
    }
    if (body.accountType !== undefined) data.accountType = String(body.accountType).trim() || "Standard";
    if (body.partnerIb !== undefined) data.partnerIb = String(body.partnerIb).trim() || null;
    if (body.verification !== undefined) {
      if (!VERIFICATIONS.includes(body.verification as (typeof VERIFICATIONS)[number])) {
        return NextResponse.json({ ok: false, error: "Invalid verification status" }, { status: 400 });
      }
      data.verification = body.verification as VerificationStatus;
    }
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) {
        return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
      }
      data.status = body.status as RecordStatus;
    }

    const account = await prisma.tradeAccount.update({ where: { id }, data });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, tradeAccount: toTradeAccountDto(account) });
  } catch (error) {
    return fail(error, "Unable to update trade account");
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid trade account id" }, { status: 400 });
    const prisma = getPrisma();
    const existing = await prisma.tradeAccount.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ ok: false, error: "Trade account not found" }, { status: 404 });
    await prisma.tradeAccount.delete({ where: { id } });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return fail(error, "Unable to delete trade account");
  }
}
