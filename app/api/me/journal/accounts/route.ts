import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toJournalAccountDto } from "@/lib/server/journal";
import { encryptSecret } from "@/lib/server/secrets";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberScopeGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The member's journal accounts (one per linked registered trade account). */
export async function GET() {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = guard.memberId;
    const rows = await getPrisma().journalAccount.findMany({
      where: { memberId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { trades: true } }, trades: { select: { closeAt: true } } },
    });
    return NextResponse.json({ ok: true, accounts: rows.map(toJournalAccountDto) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load journal" }, { status: 500 });
  }
}

/** Links one of the member's own registered trade accounts as a journal
 *  account (active + ownership-confirmed). One journal per trade account. */
export async function POST(request: NextRequest) {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = guard.memberId;
    const body = await request.json().catch(() => ({})) as {
      tradeAccountId?: number; platform?: string; startingBalance?: number; startDate?: string;
      mtServer?: string; investorPassword?: string;
    };
    const tradeAccountId = Number(body.tradeAccountId);
    if (!Number.isInteger(tradeAccountId) || tradeAccountId <= 0) {
      return NextResponse.json({ ok: false, error: "กรุณาเลือกบัญชีเทรด", code: "trade_account_required" }, { status: 400 });
    }
    const prisma = getPrisma();
    const account = await prisma.tradeAccount.findFirst({
      where: { id: tradeAccountId, memberId },
      include: { broker: { select: { name: true } } },
    });
    if (!account) return NextResponse.json({ ok: false, error: "ไม่พบบัญชีนี้ในโปรไฟล์ของคุณ", code: "account_not_found" }, { status: 404 });
    if (account.status !== "active") {
      return NextResponse.json({ ok: false, error: "บัญชีนี้ไม่ได้ใช้งานอยู่", code: "account_inactive" }, { status: 409 });
    }
    if (!account.memberConfirmed) {
      return NextResponse.json({ ok: false, error: "กรุณายืนยันความเป็นเจ้าของบัญชีนี้ก่อน (หน้าโปรไฟล์)", code: "account_unconfirmed" }, { status: 409 });
    }
    const existing = await prisma.journalAccount.findUnique({
      where: { memberId_tradeAccountId: { memberId, tradeAccountId } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ ok: false, error: "บัญชีนี้มี journal แล้ว", code: "already_linked" }, { status: 409 });
    }
    const startDate = body.startDate && !Number.isNaN(new Date(String(body.startDate)).getTime())
      ? new Date(`${String(body.startDate).slice(0, 10)}T00:00:00Z`)
      : new Date();
    // Investor (read-only) password is encrypted at rest for the future MT
    // live-sync — plaintext never leaves the server afterwards.
    const investorRaw = String(body.investorPassword || "");
    let investorPasswordEnc: string | undefined;
    if (investorRaw) {
      if (investorRaw.length > 128) return NextResponse.json({ ok: false, error: "รหัสผ่านยาวเกินไป" }, { status: 400 });
      try {
        investorPasswordEnc = encryptSecret(investorRaw);
      } catch {
        return NextResponse.json({ ok: false, error: "บันทึก investor password ไม่สำเร็จ (server ยังไม่ได้ตั้งค่า)" }, { status: 500 });
      }
    }
    const created = await prisma.journalAccount.create({
      data: {
        memberId,
        tradeAccountId,
        tradeId: account.tradeId,
        broker: account.broker?.name ?? "—",
        accountType: account.accountType || "Standard",
        platform: String(body.platform || "MetaTrader 5").slice(0, 32),
        startingBalance: Number.isFinite(Number(body.startingBalance)) && Number(body.startingBalance) >= 0 ? Number(body.startingBalance) : 0,
        startDate,
        mtServer: String(body.mtServer || "").trim().slice(0, 64) || null,
        ...(investorPasswordEnc ? { investorPasswordEnc } : {}),
        riskRule: { create: {} },
      },
      include: { _count: { select: { trades: true } }, trades: { select: { closeAt: true } } },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, account: toJournalAccountDto(created) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "เชื่อมบัญชีไม่สำเร็จ" }, { status: 400 });
  }
}
