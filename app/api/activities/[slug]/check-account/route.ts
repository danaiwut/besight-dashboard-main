import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { accountKindMessage, classifyCompetitionAccount } from "@/lib/server/activityScoring";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Checks whether an account number is a real (live) or demo account before the
 *  member registers. Live accounts are rejected — competitions are demo-only. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    await params;
    const memberId = await resolveMemberIdForUser(guard.user);
    const body = await request.json().catch(() => ({})) as { tradeId?: string };
    const tradeId = String(body.tradeId || "").trim();
    if (!tradeId) return NextResponse.json({ ok: false, error: "กรุณาระบุเลขบัญชี", code: "trade_id_required" }, { status: 400 });

    // Accounts already linked + verified to this member are known live.
    if (memberId) {
      const linked = await getPrisma().tradeAccount.findFirst({
        where: { memberId, tradeId, status: "active" },
        include: { broker: { select: { code: true } } },
      });
      if (linked && linked.broker?.code === "XM" && linked.verification === "verified") {
        return NextResponse.json({ ok: true, kind: "live", allowed: false, message: accountKindMessage("live") });
      }
    }

    const kind = await classifyCompetitionAccount(tradeId);
    return NextResponse.json({ ok: true, kind, allowed: kind !== "live", message: accountKindMessage(kind) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "ตรวจสอบบัญชีไม่สำเร็จ" }, { status: 500 });
  }
}
