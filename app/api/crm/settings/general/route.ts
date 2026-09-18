import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { GENERAL_SETTINGS_KEY, defaultGeneralSettings, normalizeGeneralSettings } from "@/lib/server/generalSettings";
import { adminSettingsGuard } from "@/lib/session";


export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await adminSettingsGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const record = await getPrisma().systemSetting.findUnique({ where: { key: GENERAL_SETTINGS_KEY } });
    if (!record) return NextResponse.json({ ok: true, settings: defaultGeneralSettings() });
    try {
      const parsed: unknown = JSON.parse(record.valueJson);
      const input = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
      return NextResponse.json({ ok: true, settings: normalizeGeneralSettings({ ...defaultGeneralSettings(), ...input }) });
    } catch {
      return NextResponse.json({ ok: true, settings: defaultGeneralSettings() });
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await adminSettingsGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body: unknown = await request.json();
    const prisma = getPrisma();
    const current = await prisma.systemSetting.findUnique({ where: { key: GENERAL_SETTINGS_KEY } });
    let merged: Record<string, unknown> = {};
    if (current) {
      try {
        const parsed: unknown = JSON.parse(current.valueJson);
        if (parsed && typeof parsed === "object") merged = parsed as Record<string, unknown>;
      } catch {
        merged = {};
      }
    }
    const settings = normalizeGeneralSettings({ ...merged, ...((body && typeof body === "object" ? body : {}) as Record<string, unknown>) });
    await prisma.systemSetting.upsert({
      where: { key: GENERAL_SETTINGS_KEY },
      update: { valueJson: JSON.stringify(settings) },
      create: { key: GENERAL_SETTINGS_KEY, valueJson: JSON.stringify(settings), description: "General CRM settings (Telegram, display windows)." },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save settings" }, { status: 400 });
  }
}
