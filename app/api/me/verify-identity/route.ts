import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { memberGuard } from "@/lib/session";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { identityMessage, markIdentityVerified, verifyMemberIdentity } from "@/lib/server/identityVerification";

export const dynamic = "force-dynamic";

/** Member proves they are the person the CRM has on file: the TradingView
 *  username they enter must match the synced Member record, and so must the
 *  email they signed in with (from the session — no longer typed). */
export async function POST(request: NextRequest) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const memberId = await resolveMemberIdForUser(guard.user);
  if (!memberId) {
    return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });
  }

  try {
    const body = await request.json() as { tradingView?: string };
    const tradingView = String(body.tradingView || "");
    const result = await verifyMemberIdentity(memberId, tradingView, guard.user.email);
    if (!result.verified) {
      return NextResponse.json(
        { ok: false, error: identityMessage(result.reason), code: result.reason === "mismatch" ? "identity_mismatch" : "identity_unavailable" },
        { status: 403 },
      );
    }
    await markIdentityVerified(memberId);
    return NextResponse.json({ ok: true, verified: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "ยืนยันตัวตนไม่สำเร็จ" }, { status: 500 });
  }
}
