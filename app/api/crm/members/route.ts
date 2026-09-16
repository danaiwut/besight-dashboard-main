import { NextRequest, NextResponse } from "next/server";
import { CustomerStage, Plan } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { readDatabaseDtos, upsertTelegramFromMember } from "@/lib/server/customerSync";
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

function optionalDecimal(value: unknown) {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

async function generateCode(): Promise<string> {
  const prisma = getPrisma();
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = `BS-${String(Math.floor(100000 + Math.random() * 900000))}`;
    if (!(await prisma.member.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new Error("Unable to generate a unique member code");
}

const ALLOWED_CHANNELS = ["facebook", "instagram", "tiktok"] as const;

export async function GET() {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    // Pure DB read (no upstream sync) — used by the realtime reload path.
    return NextResponse.json({ ok: true, ...(await readDatabaseDtos()) });
  } catch (error) {
    return fail(error, "Unable to load members", 500);
  }
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
    const prisma = getPrisma();

    const code = String(body.code || "").trim() || (await generateCode());
    if (await prisma.member.findUnique({ where: { code }, select: { id: true } })) {
      return NextResponse.json({ ok: false, error: `Member code ${code} already exists` }, { status: 400 });
    }
    const email = String(body.email || "").trim() || null;
    if (email && (await prisma.member.findUnique({ where: { email }, select: { id: true } }))) {
      return NextResponse.json({ ok: false, error: `Email ${email} already exists` }, { status: 400 });
    }

    const plan = body.plan === "ib_partner" ? Plan.ib_partner : Plan.free;
    const stage = body.customerStageOverride === "new" || body.customerStageOverride === "existing"
      ? body.customerStageOverride as CustomerStage
      : null;
    const channels = Array.isArray(body.channels)
      ? [...new Set(body.channels.map((c) => String(c)).filter((c): c is (typeof ALLOWED_CHANNELS)[number] => (ALLOWED_CHANNELS as readonly string[]).includes(c)))]
      : [];
    const joinedAt = optionalDate(body.joinedDate) || optionalDate(body.createdDate) || new Date();

    const member = await prisma.member.create({
      data: {
        code,
        name,
        displayName: String(body.displayName || "").trim() || null,
        avatarUrl: String(body.avatarUrl || "").trim() || null,
        email,
        phone: String(body.phone || "").trim() || null,
        country: String(body.country || "").trim() || null,
        address: String(body.address || "").trim() || null,
        tradingView: String(body.tradingView ?? body.tv ?? "").trim() || null,
        telegramUsername: String(body.telegramUsername || "").trim() || null,
        telegramUserId: String(body.telegramUserId || "").trim() || null,
        discordUsername: String(body.discordUsername || "").trim() || null,
        joinedAt,
        plan,
        customerStageOverride: stage,
        requiredLotsOverride: optionalDecimal(body.requiredLotsOverride),
        requiredLotsOverrideNote: String(body.requiredLotsOverrideNote || "").trim() || null,
        crmStartDate: optionalDate(body.crmStartDate),
        crmExpiryDate: optionalDate(body.crmExpiryDate),
        acquisitionChannels: channels.length ? { createMany: { data: channels.map((channel) => ({ channel })) } } : undefined,
      },
      include: { acquisitionChannels: true, tradeAccounts: true },
    });
    // A new member holds no access yet — derive the telegram row as pending.
    await upsertTelegramFromMember(member.id, member.telegramUsername, member.telegramUserId, false);
    await bumpDataVersion();
    return NextResponse.json({ ok: true, member: toMemberDto(member) });
  } catch (error) {
    return fail(error, "Unable to create member");
  }
}
