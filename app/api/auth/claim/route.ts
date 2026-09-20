import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { CLAIM_TOKEN_TTL_HOURS, createClaimToken } from "@/lib/server/claim";
import { claimEmail, isEmailConfigured, sendEmail } from "@/lib/server/email";

export const dynamic = "force-dynamic";

/* Deliberate fixed delay: without it, response time alone reveals whether an
   address belongs to a member. */
const RESPONSE_DELAY_MS = 400;

/** Always the same answer, whether or not the address matched — an endpoint
 *  that says "no such member" is a membership oracle for anyone who asks. */
const NEUTRAL = {
  ok: true,
  message: "ถ้าอีเมลนี้อยู่ในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านไปให้แล้ว",
};

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  }
  if (!isEmailConfigured()) {
    // Surfaced rather than swallowed: a claim link that goes nowhere is
    // indistinguishable from a working one for the person waiting on it.
    return NextResponse.json(
      { ok: false, error: "ระบบส่งอีเมลยังไม่ได้ตั้งค่า (RESEND_API_KEY / EMAIL_FROM)", code: "email_unconfigured" },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({})) as { email?: string };
  const email = String(body.email || "").trim();
  await new Promise((resolve) => setTimeout(resolve, RESPONSE_DELAY_MS));
  if (!email) return NextResponse.json(NEUTRAL);

  try {
    const member = await getPrisma().member.findFirst({
      where: { email },
      select: { id: true, name: true, displayName: true },
    });
    if (member) {
      const token = await createClaimToken(member.id);
      const link = `${request.nextUrl.origin}/claim/?token=${encodeURIComponent(token)}`;
      const message = claimEmail(member.displayName?.trim() || member.name, link, CLAIM_TOKEN_TTL_HOURS);
      await sendEmail({ to: email, ...message });
    }
    return NextResponse.json(NEUTRAL);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to send the claim link" },
      { status: 502 },
    );
  }
}
