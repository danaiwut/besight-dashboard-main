import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { findOwnedJournalAccount } from "@/lib/server/journal";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { encryptSecret } from "@/lib/server/secrets";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberScopeGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = guard.memberId;
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    if (!(await findOwnedJournalAccount(memberId, id))) return NextResponse.json({ ok: false, error: "Journal account not found" }, { status: 404 });

    const body = await request.json().catch(() => ({})) as {
      platform?: string; startingBalance?: number; startDate?: string; accountType?: string;
      mtServer?: string | null; investorPassword?: string | null;
    };
    const data: Record<string, unknown> = {};
    if (body.platform !== undefined) data.platform = String(body.platform).slice(0, 32) || "MetaTrader 5";
    if (body.accountType !== undefined) data.accountType = String(body.accountType).slice(0, 64) || "Standard";
    if (body.startingBalance !== undefined) {
      const balance = Number(body.startingBalance);
      if (!Number.isFinite(balance) || balance < 0) return NextResponse.json({ ok: false, error: "Invalid balance" }, { status: 400 });
      data.startingBalance = balance;
    }
    if (body.startDate !== undefined) {
      const parsed = new Date(String(body.startDate));
      if (Number.isNaN(parsed.getTime())) return NextResponse.json({ ok: false, error: "Invalid date" }, { status: 400 });
      data.startDate = parsed;
    }
    if (body.mtServer !== undefined) {
      data.mtServer = body.mtServer ? String(body.mtServer).trim().slice(0, 64) || null : null;
    }
    if (body.investorPassword !== undefined) {
      // null/empty clears it; a new value replaces (re-encrypted). The old
      // plaintext is never readable back through any API.
      if (!body.investorPassword) {
        data.investorPasswordEnc = null;
      } else {
        if (String(body.investorPassword).length > 128) {
          return NextResponse.json({ ok: false, error: "รหัสผ่านยาวเกินไป" }, { status: 400 });
        }
        try {
          data.investorPasswordEnc = encryptSecret(String(body.investorPassword));
        } catch {
          return NextResponse.json({ ok: false, error: "บันทึก investor password ไม่สำเร็จ (server ยังไม่ได้ตั้งค่า)" }, { status: 500 });
        }
      }
    }
    await getPrisma().journalAccount.update({ where: { id }, data });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const guard = await memberScopeGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = guard.memberId;
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    if (!(await findOwnedJournalAccount(memberId, id))) return NextResponse.json({ ok: false, error: "Journal account not found" }, { status: 404 });
    // Trades, rules and notes cascade with the account.
    await getPrisma().journalAccount.delete({ where: { id } });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to delete" }, { status: 400 });
  }
}
