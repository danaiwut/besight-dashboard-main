import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import {
  discordAuthorizeUrl, exchangeDiscordCode, exchangeLineCode, lineAuthorizeUrl,
  linkSocialAccount, signLinkState, verifyLinkState, type SocialProvider,
} from "@/lib/server/social";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberGuard, memberScopeGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

function baseOf(request: NextRequest): string {
  return (process.env.AUTH_URL?.replace(/\/$/, "")) || request.nextUrl.origin;
}

function doneRedirect(base: string, provider: SocialProvider, ok: boolean, error?: string): NextResponse {
  const url = new URL("/dashboard/vip/", base);
  url.searchParams.set("social", provider);
  url.searchParams.set(ok ? "linked" : "error", ok ? "1" : (error || "failed"));
  return NextResponse.redirect(url);
}

/** Step 1: signed state → provider authorize page (login happens there,
 *  inside the Discord app / browser when installed). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const raw = (await params).provider;
    const provider: SocialProvider | null = raw === "discord" || raw === "line" ? raw : null;
    if (!provider) return NextResponse.json({ ok: false, error: "Use the Telegram widget for telegram" }, { status: 400 });
    const memberId = guard.memberId;
    const base = baseOf(request);
    const state = signLinkState(memberId, provider);
    const url = provider === "discord" ? discordAuthorizeUrl(base, state) : lineAuthorizeUrl(base, state);
    return NextResponse.redirect(url);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to start linking" }, { status: 400 });
  }
}

/** Step 2 (shared): provider redirects back with ?code=&state=. The state
 *  must match the signed-in member or the link is rejected. */
export async function linkCallback(
  request: NextRequest,
  provider: SocialProvider,
): Promise<NextResponse> {
  const guard = await memberGuard();
  const base = baseOf(request);
  if (!guard.ok) return doneRedirect(base, provider, false, "session");
  if (!isDatabaseConfigured()) return doneRedirect(base, provider, false, "database");
  try {
    const memberId = await resolveMemberIdForUser(guard.user);
    if (!memberId) return doneRedirect(base, provider, false, "profile");
    const code = request.nextUrl.searchParams.get("code") || "";
    const state = request.nextUrl.searchParams.get("state") || "";
    if (!code || verifyLinkState(state, memberId) !== provider) {
      return doneRedirect(base, provider, false, "state");
    }
    const identity = provider === "discord"
      ? await exchangeDiscordCode(base, code)
      : await exchangeLineCode(base, code);
    await linkSocialAccount(memberId, provider, identity);
    await bumpDataVersion();
    return doneRedirect(base, provider, true);
  } catch {
    return doneRedirect(base, provider, false, "exchange");
  }
}
