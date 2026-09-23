import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { checkAdminClaimToken, consumeAdminClaimToken } from "@/lib/server/adminClaim";
import { hashPassword } from "@/lib/server/password";
import { revokeAdminSessions } from "@/lib/server/sessions";

export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 8;

/** GET: is this link still usable? Lets the page show "expired" before the
 *  person types a password rather than after. Reveals nothing but validity. */
export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  }
  const check = await checkAdminClaimToken(request.nextUrl.searchParams.get("token") || "");
  return NextResponse.json({ ok: true, valid: check.ok });
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as { token?: string; password?: string };
  const password = String(body.password || "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร` },
      { status: 400 },
    );
  }

  const check = await checkAdminClaimToken(String(body.token || ""));
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: "ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว", code: "invalid_token" }, { status: 400 });
  }

  try {
    await getPrisma().admin.update({
      where: { id: check.adminId },
      data: { passwordHash: await hashPassword(password) },
    });
    await consumeAdminClaimToken(check.tokenId);
    // New credentials retire every session issued under the old ones.
    await revokeAdminSessions(check.adminId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to set the password" },
      { status: 500 },
    );
  }
}
