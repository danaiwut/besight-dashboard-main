import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { listAvatarOptions } from "@/lib/server/avatarCatalog";
import { memberGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Avatars a member can pick for their leaderboard profile. */
export async function GET() {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, options: await listAvatarOptions(true) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load avatars" }, { status: 500 });
  }
}
