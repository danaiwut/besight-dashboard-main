import { NextRequest, NextResponse } from "next/server";
import { RecordStatus } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { memberGuard } from "@/lib/session";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { toTradeAccountDto } from "@/lib/server/crmDtos";
import { verifyTradeId } from "@/lib/server/tradeVerification";
import { identityMessage, markIdentityVerified, verifyMemberIdentity } from "@/lib/server/identityVerification";

export const dynamic = "force-dynamic";

/** A member links their own Trade ID. Members are not pre-provisioned with
 *  trade accounts to claim — they enter the Trade ID themselves here.
 *
 *  - verified against the lot-check webhook (verified / pending)
 *  - a Trade ID already linked to ANOTHER member is rejected (409)
 *  - re-submitting your own ID returns the existing row (alreadyLinked)
 */
export async function POST(request: NextRequest) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const memberId = await resolveMemberIdForUser(guard.user);
  if (!memberId) {
    return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });
  }
  try {
    const body = await request.json() as { tradeId?: string; brokerId?: number; tradingView?: string; email?: string };
    const tradeId = String(body.tradeId || "").trim();
    if (!tradeId) return NextResponse.json({ ok: false, error: "กรุณากรอก Trade ID" }, { status: 400 });
    if (tradeId.length > 64) return NextResponse.json({ ok: false, error: "Trade ID ยาวเกินไป" }, { status: 400 });

    // Prove the claimant is the member on file BEFORE touching any account:
    // the TradingView username + email must match the CRM-synced record.
    const identity = await verifyMemberIdentity(memberId, String(body.tradingView || ""), String(body.email || ""));
    if (!identity.verified) {
      return NextResponse.json(
        { ok: false, error: identityMessage(identity.reason), code: identity.reason === "mismatch" ? "identity_mismatch" : "identity_unavailable" },
        { status: 403 },
      );
    }
    // A successful check here also counts as verification for the dashboard.
    await markIdentityVerified(memberId);

    const prisma = getPrisma();

    // One Trade ID can belong to a single member only. Look for the member's
    // OWN row first: upstream data can carry the same trade ID under several
    // members, and a foreign duplicate must not block a legitimate claim.
    const mine = await prisma.tradeAccount.findFirst({ where: { tradeId, memberId } });
    if (mine) {
      if (!mine.memberConfirmed) {
        const claimed = await prisma.tradeAccount.update({ where: { id: mine.id }, data: { memberConfirmed: true } });
        await bumpDataVersion();
        return NextResponse.json({ ok: true, claimed: true, tradeAccount: toTradeAccountDto(claimed) });
      }
      return NextResponse.json({ ok: true, alreadyLinked: true, tradeAccount: toTradeAccountDto(mine) });
    }
    const other = await prisma.tradeAccount.findFirst({ where: { tradeId, memberId: { not: memberId } }, select: { id: true } });
    if (other) {
      return NextResponse.json(
        { ok: false, error: `Trade ID ${tradeId} ถูกผูกกับสมาชิกคนอื่นแล้ว`, code: "trade_id_taken" },
        { status: 409 },
      );
    }

    const brokerId = Number(body.brokerId);
    const broker = Number.isInteger(brokerId) && brokerId > 0
      ? await prisma.broker.findUnique({ where: { id: brokerId }, select: { id: true, code: true, name: true } })
      : null;

    // Auto-verify; a webhook outage must not block the member — the account is
    // still saved, just left "pending" for a later check.
    let verification: "pending" | "verified" = "pending";
    let verificationMessage = "บันทึกแล้ว — ระบบจะตรวจสอบการเทรดให้อีกครั้งโดยอัตโนมัติ";
    try {
      const result = await verifyTradeId(tradeId);
      verification = result.verification === "verified" ? "verified" : "pending";
      verificationMessage = result.message;
    } catch {
      // keep the default pending message
    }

    const account = await prisma.tradeAccount.create({
      data: {
        memberId,
        brokerId: broker?.id ?? null,
        tradeId,
        accountType: "Standard",
        partnerIb: broker?.code ?? null,
        verification,
        status: RecordStatus.active,
        // Self-added = the member is claiming it, so it's confirmed by nature.
        memberConfirmed: true,
        lastSyncAt: new Date(),
      },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, tradeAccount: toTradeAccountDto(account), verificationMessage });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "เพิ่มบัญชีเทรดไม่สำเร็จ" }, { status: 500 });
  }
}
