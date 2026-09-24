import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { readEaPolicy, writeEaPolicy } from "@/lib/server/eaPolicy";
import { actorFromSession, adminGuard, adminSettingsGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, policy: await readEaPolicy() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load EA policy" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await adminSettingsGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = (await request.json()) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) return NextResponse.json({ ok: false, error: "Policy text is required" }, { status: 400 });
    if (text.length > 20000) return NextResponse.json({ ok: false, error: "Policy text is too long" }, { status: 400 });
    return NextResponse.json({ ok: true, policy: await writeEaPolicy(text, actorFromSession(guard.user)) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save EA policy" }, { status: 400 });
  }
}
