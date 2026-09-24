import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { memberGuard } from "@/lib/session";
import { parseLeaderboardProfile } from "@/lib/leaderboardProfile";

export const dynamic = "force-dynamic";

/** A member's leaderboard photo as an image (signed-in members only). The
 *  board links here with ?v=<content hash>, so it can be cached hard. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse(null, { status: 404 });
  const member = await getPrisma().member.findUnique({ where: { id }, select: { leaderboardProfileJson: true } });
  const profile = parseLeaderboardProfile(member?.leaderboardProfileJson);
  if (profile.anonymous || profile.avatar.kind !== "photo") return new NextResponse(null, { status: 404 });
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(profile.avatar.dataUrl);
  if (!match) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(match[2], "base64"), {
    headers: {
      "Content-Type": match[1],
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
