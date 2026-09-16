import { NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { toTelegramAccessDto } from "@/lib/server/crmDtos";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const records = await getPrisma().telegramAccess.findMany({ orderBy: { id: "asc" } });
    return NextResponse.json({ ok: true, telegramAccess: records.map(toTelegramAccessDto) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load Telegram access" }, { status: 500 });
  }
}
