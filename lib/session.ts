import { NextResponse } from "next/server";
import { isDatabaseConfigured, getPrisma } from "./server/prisma";
import { auth } from "@/auth";

/* Server-side session accessors. Route handlers call the `*Guard` helpers
   (defence in depth on top of the page-level checks in app/crm + app/dashboard
   layouts) so an API can never be reached without the right role.

   Admin guards also load the Admin row: that enforces the CRM role levels
   (Owner/Admin/Support/Viewer) and instantly revokes access for a deleted
   admin instead of trusting the JWT until it expires. */

export type SessionUser = {
  role?: "admin" | "member";
  memberId?: number;
  adminId?: number;
  email?: string | null;
  name?: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  return (session?.user as SessionUser | undefined) ?? null;
}

export function authRequired() {
  return NextResponse.json({ ok: false, error: "Unauthorized", code: "auth_required" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ ok: false, error: "Forbidden", code: "role_required" }, { status: 403 });
}

type AdminUser = SessionUser & { adminId: number; adminRole: string; isOwner: boolean };
type AdminGuard = { ok: true; user: AdminUser } | { ok: false; response: NextResponse };
type AnyGuard = { ok: true; user: SessionUser } | { ok: false; response: NextResponse };

/** Admin-only endpoints (everything under /api/crm). */
export async function adminGuard(): Promise<AdminGuard> {
  const user = await getSessionUser();
  if (!user) return { ok: false, response: authRequired() };
  if (user.role !== "admin" || !user.adminId) return { ok: false, response: forbidden() };
  if (!isDatabaseConfigured()) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 }) };
  }
  const admin = await getPrisma().admin.findUnique({ where: { id: user.adminId }, select: { role: true, isOwner: true } });
  // A deleted admin loses access immediately, not when the JWT expires.
  if (!admin) return { ok: false, response: authRequired() };
  return { ok: true, user: { ...user, adminId: user.adminId, adminRole: admin.role, isOwner: admin.isOwner } };
}

/** Non-GET admin endpoints — Viewers are read-only. */
export async function adminWriteGuard(): Promise<AdminGuard> {
  const guard = await adminGuard();
  if (!guard.ok) return guard;
  if (guard.user.adminRole === "Viewer") return { ok: false, response: forbidden() };
  return guard;
}

/** Settings + admin management — Owner/Admin only (Support and Viewer blocked). */
export async function adminSettingsGuard(): Promise<AdminGuard> {
  const guard = await adminGuard();
  if (!guard.ok) return guard;
  if (!guard.user.isOwner && guard.user.adminRole !== "Admin") return { ok: false, response: forbidden() };
  return guard;
}

/** The name an ActivityLog row is attributed to. Always derived from the
 *  server-side session: an audit trail whose actor comes from the request body
 *  (or a hardcoded literal) records who *claimed* to act, not who did. */
export function actorFromSession(user: SessionUser): string {
  const name = user.name?.trim();
  if (name) return name;
  const email = user.email?.trim();
  if (email) return email;
  if (user.adminId) return `admin#${user.adminId}`;
  if (user.memberId) return `member#${user.memberId}`;
  return "Unknown";
}

/** Signed-in endpoints readable by a member or an admin (/api/me, /api/activities). */
export async function memberGuard(): Promise<AnyGuard> {
  const user = await getSessionUser();
  if (!user) return { ok: false, response: authRequired() };
  if (user.role === "admin") return { ok: true, user };
  if (user.role === "member" && user.memberId) return { ok: true, user };
  return { ok: false, response: forbidden() };
}
