import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import { adminGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 8;

/* Lets an admin change their OWN sign-in password. Any CRM role may call it
   (Support/Viewer included) — the session decides whose row changes, never a
   request parameter. Bumps tokenVersion so every existing session (including
   sessions on other devices) stops working; the caller signs in again. */
export async function POST(request: NextRequest) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ ok: false, error: "Current and new passwords are required", code: "password_required" }, { status: 400 });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { ok: false, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`, code: "password_too_short" },
        { status: 400 },
      );
    }

    const prisma = getPrisma();
    const admin = await prisma.admin.findUnique({ where: { id: guard.user.adminId } });
    if (!admin) return NextResponse.json({ ok: false, error: "Admin not found", code: "admin_not_found" }, { status: 404 });
    if (!(await verifyPassword(currentPassword, admin.passwordHash))) {
      return NextResponse.json({ ok: false, error: "Current password is incorrect", code: "wrong_current_password" }, { status: 403 });
    }

    await prisma.admin.update({
      where: { id: admin.id },
      data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to change password" }, { status: 400 });
  }
}
