import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { readSpinSettings, saveSpinSettings } from "@/lib/server/spin";
import { adminSettingsGuard } from "@/lib/session";


export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await adminSettingsGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, settings: await readSpinSettings() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load spin settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await adminSettingsGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json().catch(() => ({}));
    const settings = await saveSpinSettings(body);
    await bumpDataVersion();
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save spin settings" }, { status: 400 });
  }
}
