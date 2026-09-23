import { NextResponse } from "next/server";
import { authRequired, forbidden, getSessionUser } from "@/lib/session";
import {
  CRM_GATE_COOKIE,
  CRM_GATE_MAX_AGE,
  crmGateCookieValue,
  isCrmGateConfigured,
  verifyGatePassword,
} from "@/lib/server/crmGate";

export const dynamic = "force-dynamic";

/* Unlocks the second CRM password layer. Deliberately NOT behind
   adminGuard(): the caller must already hold an admin session, but must
   NOT yet hold the gate — requiring the gate here would make unlocking
   impossible. */

async function requireAdminSession() {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, response: authRequired() };
  if (user.role !== "admin" || !user.adminId) return { ok: false as const, response: forbidden() };
  return { ok: true as const };
}

function gateNotConfigured() {
  return NextResponse.json({ ok: false, error: "CRM gate is not configured" }, { status: 503 });
}

export async function POST(request: Request) {
  if (!isCrmGateConfigured()) return gateNotConfigured();
  const session = await requireAdminSession();
  if (!session.ok) return session.response;

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!verifyGatePassword(password)) {
    return NextResponse.json({ ok: false, error: "Invalid gate password" }, { status: 403 });
  }

  const value = crmGateCookieValue();
  if (!value) return gateNotConfigured();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CRM_GATE_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: CRM_GATE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

/** Locks the gate again on this browser (clears the unlock cookie). */
export async function DELETE() {
  if (!isCrmGateConfigured()) return gateNotConfigured();
  const session = await requireAdminSession();
  if (!session.ok) return session.response;
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(CRM_GATE_COOKIE);
  return response;
}
