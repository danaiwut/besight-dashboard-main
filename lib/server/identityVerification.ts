import { getPrisma } from "./prisma";

/* Identity check for claiming a trade account. The member proves they are the
   person the CRM has on file by entering the TradingView username the CRM sync
   stored. The email is not typed: it is the address the member signed in with
   (taken from the session), which must match the CRM record. This is a
   data-consistency check, not a secret. */

export type IdentityCheck =
  | { verified: true }
  | { verified: false; reason: "member_not_found" | "no_crm_data" | "mismatch" };

function normUsername(value: string) {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

/** `sessionEmail` is the signed-in account's email, never user input. */
export async function verifyMemberIdentity(memberId: number, tradingView: string, sessionEmail: string | null | undefined): Promise<IdentityCheck> {
  const member = await getPrisma().member.findUnique({
    where: { id: memberId },
    select: { tradingView: true, email: true },
  });
  if (!member) return { verified: false, reason: "member_not_found" };

  const expectedTv = normUsername(member.tradingView || "");
  const expectedEmail = (member.email || "").trim().toLowerCase();
  // Without CRM data there is nothing to compare against — treat as unverifiable.
  if (!expectedTv || !expectedEmail) return { verified: false, reason: "no_crm_data" };

  const givenTv = normUsername(tradingView);
  const givenEmail = (sessionEmail || "").trim().toLowerCase();
  if (!givenTv || !givenEmail) return { verified: false, reason: "mismatch" };
  if (givenTv !== expectedTv || givenEmail !== expectedEmail) return { verified: false, reason: "mismatch" };

  return { verified: true };
}

export function identityMessage(reason: string): string {
  switch (reason) {
    case "member_not_found":
      return "ไม่พบข้อมูลสมาชิกของคุณ";
    case "no_crm_data":
      return "ระบบยังไม่มีข้อมูล TradingView/อีเมลของคุณ — กรุณาติดต่อฝ่ายสนับสนุน";
    default:
      return "ชื่อผู้ใช้ TradingView ไม่ตรงกับที่ระบบมี (หรืออีเมลที่ใช้เข้าสู่ระบบไม่ตรงกับอีเมลในระบบ) — กรุณาตรวจสอบอีกครั้ง";
  }
}

/** Records that the member passed the identity check so the dashboard stops
 *  prompting them on later visits. Best-effort: a failed write must never fail
 *  a verification that already succeeded. */
export async function markIdentityVerified(memberId: number): Promise<void> {
  try {
    await getPrisma().member.update({ where: { id: memberId }, data: { identityVerifiedAt: new Date() } });
  } catch {
    // best-effort — verification itself already passed
  }
}
