import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import {
  discordAuthorizeUrl, lineAuthorizeUrl,
  signLinkState, type SocialProvider,
} from "@/lib/server/social";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberScopeGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Step 1: signed state → provider authorize page (login happens there,
 *  inside the Discord/LINE app when installed). Telegram uses the Login
 *  Widget instead — see /api/me/social. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const raw = (await params).provider;
    const provider: SocialProvider | null = raw === "discord" || raw === "line" ? raw : null;
    if (!provider) return NextResponse.json({ ok: false, error: "Use the Telegram widget for telegram" }, { status: 400 });
    const memberId = guard.memberId;
    const base = (process.env.AUTH_URL?.replace(/\/$/, "")) || request.nextUrl.origin;
    const state = signLinkState(memberId, provider);
    const url = provider === "discord" ? discordAuthorizeUrl(base, state) : lineAuthorizeUrl(base, state);
    return NextResponse.redirect(url);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to start linking" }, { status: 400 });
  }
}
