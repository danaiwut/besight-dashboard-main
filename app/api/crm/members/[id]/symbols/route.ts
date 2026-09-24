import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { symbolsByMember } from "@/lib/server/memberSymbols";
import { adminGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Symbols the member has traded, with trade count + lots per symbol. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid member id" }, { status: 400 });
    const symbols = (await symbolsByMember([id])).get(id) ?? [];
    return NextResponse.json({ ok: true, symbols });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load symbols" }, { status: 500 });
  }
}
