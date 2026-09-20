import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { linkSocialAccount, unlinkSocialAccount, verifyTelegramLogin, type SocialProvider } from "@/lib/server/social";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberScopeGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ provider: string }> };

function parseProvider(raw: string): SocialProvider | null {
  return raw === "telegram" || raw === "discord" || raw === "line" ? raw : null;
}

/** Telegram Login Widget callback: the widget posts the signed user object
 *  after the member confirms inside the Telegram app. */
export async function POST(request: NextRequest, { params }: Params) {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const provider = parseProvider((await params).provider);
    if (provider !== "telegram") return NextResponse.json({ ok: false, error: "Use the OAuth flow for this provider" }, { status: 400 });
    const memberId = guard.memberId;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const params_: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string" || typeof value === "number") params_[key] = String(value);
    }
    const identity = verifyTelegramLogin(params_);
    if (!identity) return NextResponse.json({ ok: false, error: "ยืนยันตัวตน Telegram ไม่สำเร็จ", code: "verify_failed" }, { status: 400 });

    await linkSocialAccount(memberId, "telegram", identity);
    await bumpDataVersion();
    return NextResponse.json({ ok: true, username: identity.username });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const provider = parseProvider((await params).provider);
    if (!provider) return NextResponse.json({ ok: false, error: "Unknown provider" }, { status: 400 });
    const memberId = guard.memberId;
    await unlinkSocialAccount(memberId, provider);
    await bumpDataVersion();
    return NextResponse.json({ ok: true, provider });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "ยกเลิกการเชื่อมต่อไม่สำเร็จ" }, { status: 400 });
  }
}
