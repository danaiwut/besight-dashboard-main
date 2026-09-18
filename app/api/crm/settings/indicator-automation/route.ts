import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { readIndicatorAutomationSettings, saveIndicatorAutomationSettings } from "@/lib/server/indicatorSettings";
import { adminSettingsGuard } from "@/lib/session";


export const dynamic = "force-dynamic";

function unavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

export async function GET() {
  const guard = await adminSettingsGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return unavailable();
  try {
    return NextResponse.json({ ok: true, settings: await readIndicatorAutomationSettings() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await adminSettingsGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return unavailable();
  try {
    const body: unknown = await request.json();
    const settings = await saveIndicatorAutomationSettings(body);
    await bumpDataVersion();
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save settings" }, { status: 400 });
  }
}
