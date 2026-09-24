import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/server/prisma";
import { memberScopeGuard } from "@/lib/session";
import { publicLabel } from "@/lib/server/leaderboardLabel";
import { LEADERBOARD_PHOTO_MAX_CHARS, normalizeLeaderboardProfile, parseLeaderboardProfile } from "@/lib/leaderboardProfile";

export const dynamic = "force-dynamic";

/** The signed-in member's own leaderboard profile + the label they get by
 *  default (for the settings preview). */
export async function GET() {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  try {
    const member = await getPrisma().member.findUnique({
      where: { id: guard.memberId },
      select: { name: true, displayName: true, code: true, leaderboardProfileJson: true },
    });
    if (!member) return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });
    return NextResponse.json({
      ok: true,
      profile: parseLeaderboardProfile(member.leaderboardProfileJson),
      defaultLabel: publicLabel(member.displayName, member.name, member.code),
      code: member.code,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load leaderboard profile" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  try {
    const raw = await request.text();
    // Reject oversized bodies up front (a photo is capped well below this).
    if (raw.length > LEADERBOARD_PHOTO_MAX_CHARS + 4_000) {
      return NextResponse.json({ ok: false, error: "Profile photo is too large" }, { status: 413 });
    }
    const body: unknown = JSON.parse(raw);
    const profile = normalizeLeaderboardProfile(body);
    const wantedPhoto = Boolean(body && typeof body === "object" && (body as { avatar?: { kind?: string } }).avatar?.kind === "photo");
    if (wantedPhoto && profile.avatar.kind !== "photo") {
      return NextResponse.json({ ok: false, error: "Unsupported or too large profile photo" }, { status: 400 });
    }
    await getPrisma().member.update({
      where: { id: guard.memberId },
      data: { leaderboardProfileJson: JSON.stringify(profile) },
    });
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save leaderboard profile" }, { status: 400 });
  }
}
