import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { readIndicatorAutomationSettings, saveIndicatorAutomationSettings } from "@/lib/server/indicatorSettings";

export const dynamic = "force-dynamic";

function unavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

export async function GET() {
  if (!isDatabaseConfigured()) return unavailable();
  try {
    return NextResponse.json({ ok: true, settings: await readIndicatorAutomationSettings() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isDatabaseConfigured()) return unavailable();
  try {
    const body: unknown = await request.json();
    return NextResponse.json({ ok: true, settings: await saveIndicatorAutomationSettings(body) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save settings" }, { status: 400 });
  }
}
