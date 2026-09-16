import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, getPrisma } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";

export const dynamic = "force-dynamic";

const KEY = "crm_general";

export type GeneralSettings = {
  telegramBotToken: string;
  telegramPrivateRoomId: string;
  telegramAutoRemove: boolean;
  expiringSoonDays: number;
  lotCalculationMode: "sum_all_verified" | "selected_only";
};

export function defaultGeneralSettings(): GeneralSettings {
  return {
    telegramBotToken: "",
    telegramPrivateRoomId: "",
    telegramAutoRemove: true,
    expiringSoonDays: 7,
    lotCalculationMode: "sum_all_verified",
  };
}

function normalize(value: unknown): GeneralSettings {
  const defaults = defaultGeneralSettings();
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const expiring = Number(input.expiringSoonDays);
  return {
    telegramBotToken: typeof input.telegramBotToken === "string" ? input.telegramBotToken : defaults.telegramBotToken,
    telegramPrivateRoomId: typeof input.telegramPrivateRoomId === "string" ? input.telegramPrivateRoomId : defaults.telegramPrivateRoomId,
    telegramAutoRemove: typeof input.telegramAutoRemove === "boolean" ? input.telegramAutoRemove : defaults.telegramAutoRemove,
    expiringSoonDays: Number.isFinite(expiring) && expiring >= 1 ? Math.floor(expiring) : defaults.expiringSoonDays,
    lotCalculationMode: input.lotCalculationMode === "selected_only" ? "selected_only" : "sum_all_verified",
  };
}

export async function GET() {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const record = await getPrisma().systemSetting.findUnique({ where: { key: KEY } });
    if (!record) return NextResponse.json({ ok: true, settings: defaultGeneralSettings() });
    try {
      const parsed: unknown = JSON.parse(record.valueJson);
      const input = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
      return NextResponse.json({ ok: true, settings: normalize({ ...defaultGeneralSettings(), ...input }) });
    } catch {
      return NextResponse.json({ ok: true, settings: defaultGeneralSettings() });
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body: unknown = await request.json();
    const current = await getPrisma().systemSetting.findUnique({ where: { key: KEY } });
    let merged: Record<string, unknown> = {};
    if (current) {
      try {
        const parsed: unknown = JSON.parse(current.valueJson);
        if (parsed && typeof parsed === "object") merged = parsed as Record<string, unknown>;
      } catch {
        merged = {};
      }
    }
    const settings = normalize({ ...merged, ...((body && typeof body === "object" ? body : {}) as Record<string, unknown>) });
    await getPrisma().systemSetting.upsert({
      where: { key: KEY },
      update: { valueJson: JSON.stringify(settings) },
      create: { key: KEY, valueJson: JSON.stringify(settings), description: "General CRM settings (Telegram, display windows)." },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save settings" }, { status: 400 });
  }
}
