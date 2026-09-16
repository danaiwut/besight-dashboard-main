import { NextRequest, NextResponse } from "next/server";
import { CustomerStage, IndicatorAccessStatus, Plan } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { upsertTelegramFromMember } from "@/lib/server/customerSync";
import { toMemberDto } from "@/lib/server/crmDtos";

export const dynamic = "force-dynamic";

function fail(error: unknown, fallback: string, status = 400) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : fallback }, { status });
}

function optionalDate(value: unknown) {
  if (value == null || value === "") return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function optionalDecimal(value: unknown, allowNull: boolean) {
  if (value === null) return allowNull ? null : undefined;
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

const ALLOWED_CHANNELS = ["facebook", "instagram", "tiktok"] as const;

async function findMember(id: number) {
  const member = await getPrisma().member.findUnique({
    where: { id },
    include: { acquisitionChannels: true, tradeAccounts: true },
  });
  return member;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid member id" }, { status: 400 });
    const prisma = getPrisma();
    const current = await findMember(id);
    if (!current) return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });

    const body = await request.json() as Record<string, unknown>;
    if (body.name !== undefined && !String(body.name).trim()) {
      return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
    }
    if (body.code !== undefined) {
      const code = String(body.code).trim();
      if (!code) return NextResponse.json({ ok: false, error: "Code is required" }, { status: 400 });
      const clash = await prisma.member.findUnique({ where: { code }, select: { id: true } });
      if (clash && clash.id !== id) return NextResponse.json({ ok: false, error: `Member code ${code} already exists` }, { status: 400 });
    }
    if (body.email !== undefined && String(body.email).trim()) {
      const clash = await prisma.member.findUnique({ where: { email: String(body.email).trim() }, select: { id: true } });
      if (clash && clash.id !== id) return NextResponse.json({ ok: false, error: "Email already exists" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (body.code !== undefined) data.code = String(body.code).trim();
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.displayName !== undefined) data.displayName = String(body.displayName).trim() || null;
    if (body.avatarUrl !== undefined) data.avatarUrl = String(body.avatarUrl).trim() || null;
    if (body.email !== undefined) data.email = String(body.email).trim() || null;
    if (body.phone !== undefined) data.phone = String(body.phone).trim() || null;
    if (body.country !== undefined) data.country = String(body.country).trim() || null;
    if (body.address !== undefined) data.address = String(body.address).trim() || null;
    if (body.tradingView !== undefined || body.tv !== undefined) data.tradingView = String(body.tradingView ?? body.tv ?? "").trim() || null;
    if (body.telegramUsername !== undefined) data.telegramUsername = String(body.telegramUsername).trim() || null;
    if (body.telegramUserId !== undefined) data.telegramUserId = String(body.telegramUserId).trim() || null;
    if (body.discordUsername !== undefined) data.discordUsername = String(body.discordUsername).trim() || null;
    if (body.joinedDate !== undefined) { const d = optionalDate(body.joinedDate); if (d) data.joinedAt = d; }
    if (body.plan !== undefined) data.plan = body.plan === "ib_partner" ? Plan.ib_partner : Plan.free;
    if (body.customerStageOverride !== undefined) {
      data.customerStageOverride = body.customerStageOverride === "new" || body.customerStageOverride === "existing"
        ? body.customerStageOverride as CustomerStage
        : null;
    }
    if (body.requiredLotsOverride !== undefined) data.requiredLotsOverride = optionalDecimal(body.requiredLotsOverride, true);
    if (body.requiredLotsOverrideNote !== undefined) data.requiredLotsOverrideNote = String(body.requiredLotsOverrideNote).trim() || null;
    if (body.crmStartDate !== undefined) data.crmStartDate = optionalDate(body.crmStartDate) || null;
    if (body.crmExpiryDate !== undefined) data.crmExpiryDate = optionalDate(body.crmExpiryDate) || null;
    if (body.primaryTradeAccountId !== undefined) {
      const accountId = Number(body.primaryTradeAccountId);
      data.primaryTradeAccountId = Number.isInteger(accountId) && accountId > 0 ? accountId : null;
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) await tx.member.update({ where: { id }, data });
      if (body.channels !== undefined && Array.isArray(body.channels)) {
        const channels = [...new Set(body.channels.map((c) => String(c)).filter((c): c is (typeof ALLOWED_CHANNELS)[number] => (ALLOWED_CHANNELS as readonly string[]).includes(c)))];
        await tx.memberAcquisitionChannel.deleteMany({ where: { memberId: id } });
        if (channels.length) await tx.memberAcquisitionChannel.createMany({ data: channels.map((channel) => ({ memberId: id, channel })) });
      }
    });
    const updated = await findMember(id);
    // Keep the derived telegram row in step with edited contact info.
    if (body.telegramUsername !== undefined || body.telegramUserId !== undefined) {
      const activeAccess = await prisma.memberIndicatorAccess.count({
        where: { memberId: id, status: IndicatorAccessStatus.active },
      });
      await upsertTelegramFromMember(id, updated!.telegramUsername, updated!.telegramUserId, activeAccess > 0);
    }
    await bumpDataVersion();
    return NextResponse.json({ ok: true, member: toMemberDto(updated!) });
  } catch (error) {
    return fail(error, "Unable to update member");
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid member id" }, { status: 400 });
    const prisma = getPrisma();
    const existing = await prisma.member.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });
    // Relations cascade (trade accounts, logs, access, renewals, telegram);
    // activity logs and lot runs detach via SetNull.
    await prisma.member.delete({ where: { id } });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return fail(error, "Unable to delete member");
  }
}
