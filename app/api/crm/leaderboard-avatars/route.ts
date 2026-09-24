import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { listAvatarOptions, toAvatarOptionDto, validateImageData } from "@/lib/server/avatarCatalog";
import { AVATAR_OPTION_MAX_CHARS } from "@/lib/leaderboardProfile";
import { actorFromSession, adminGuard, adminWriteGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The whole avatar catalog (including hidden ones) for the CRM. */
export async function GET() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, options: await listAvatarOptions(false) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load avatars" }, { status: 500 });
  }
}

/** Add an avatar members can pick: { label, imageData (data URL) }. */
export async function POST(request: NextRequest) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = (await request.json()) as { label?: unknown; imageData?: unknown };
    const image = validateImageData(body.imageData, AVATAR_OPTION_MAX_CHARS);
    if (!image.ok) return NextResponse.json({ ok: false, error: image.error }, { status: 400 });
    const label = String(body.label ?? "").trim().slice(0, 96) || "Avatar";
    const prisma = getPrisma();
    const last = await prisma.leaderboardAvatarOption.aggregate({ _max: { sortOrder: true } });
    const row = await prisma.leaderboardAvatarOption.create({
      data: { label, imageData: image.dataUrl, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    });
    await prisma.activityLog.create({
      data: { actor: actorFromSession(guard.user).slice(0, 96), action: "Leaderboard Avatar Added", description: `Added leaderboard avatar "${label}" (#${row.id}).`, notification: false },
    });
    return NextResponse.json({ ok: true, option: toAvatarOptionDto(row) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to add avatar" }, { status: 400 });
  }
}
