import { NextRequest, NextResponse } from "next/server";
import { TelegramStatus } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toTelegramAccessDto } from "@/lib/server/crmDtos";

export const dynamic = "force-dynamic";

const STATUSES = ["active", "pending", "expired", "banned"] as const;

function parseDate(value: unknown): Date | undefined {
  if (value == null || value === "") return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid telegram access id" }, { status: 400 });
    const prisma = getPrisma();
    const current = await prisma.telegramAccess.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ ok: false, error: "Telegram access not found" }, { status: 404 });

    const body = await request.json() as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) {
        return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
      }
      data.status = body.status as TelegramStatus;
    }
    if (body.expiryDate !== undefined) data.expiresAt = parseDate(body.expiryDate);
    if (body.grantedDate !== undefined) { const d = parseDate(body.grantedDate); if (d) data.grantedAt = d; }
    if (body.username !== undefined) data.username = String(body.username).trim() || null;
    if (body.userId !== undefined) data.userId = String(body.userId).trim() || null;

    const record = await prisma.telegramAccess.update({ where: { id }, data });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, telegramAccess: toTelegramAccessDto(record) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update Telegram access" }, { status: 400 });
  }
}
