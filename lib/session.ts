import { NextResponse, type NextRequest } from "next/server";
import { isDatabaseConfigured, getPrisma } from "./server/prisma";
import { resolveMemberIdForUser } from "./server/authIdentity";
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
  /** Snapshot of the account's tokenVersion when this JWT was issued. A bump on
   *  the row invalidates every token minted before it — the revocation the
   *  stateless-JWT strategy otherwise has no way to express. */
  tokenVersion?: number;
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

/** The CRM role levels. A union rather than `string` so a mistyped comparison
 *  is a compile error instead of a silently-never-true permission check. */
export type AdminRole = "Owner" | "Admin" | "Support" | "Viewer";

function toAdminRole(value: string): AdminRole {
  // Anything unrecognised falls to the least privilege we have.
  return value === "Owner" || value === "Admin" || value === "Support" ? value : "Viewer";
}

type AdminUser = SessionUser & { adminId: number; adminRole: AdminRole; isOwner: boolean };
type AdminGuard = { ok: true; user: AdminUser } | { ok: false; response: NextResponse };
type AnyGuard = { ok: true; user: SessionUser } | { ok: false; response: NextResponse };
type MemberScopeGuard = { ok: true; user: SessionUser; memberId: number } | { ok: false; response: NextResponse };

/** Admin-only endpoints (everything under /api/crm). */
export async function adminGuard(): Promise<AdminGuard> {
  const user = await getSessionUser();
  if (!user) return { ok: false, response: authRequired() };
  if (user.role !== "admin" || !user.adminId) return { ok: false, response: forbidden() };
  if (!isDatabaseConfigured()) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 }) };
  }
  const admin = await getPrisma().admin.findUnique({
    where: { id: user.adminId },
    select: { role: true, isOwner: true, tokenVersion: true },
  });
  // A deleted admin loses access immediately, not when the JWT expires.
  if (!admin) return { ok: false, response: authRequired() };
  // Same for one whose sessions were revoked (password change, forced sign-out).
  if ((user.tokenVersion ?? 0) !== admin.tokenVersion) return { ok: false, response: authRequired() };
  return { ok: true, user: { ...user, adminId: user.adminId, adminRole: toAdminRole(admin.role), isOwner: admin.isOwner } };
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
  // Admins are validated (including tokenVersion) by the admin guard.
  if (user.role === "admin") {
    const guard = await adminGuard();
    return guard.ok ? { ok: true, user: guard.user } : guard;
  }
  if (user.role !== "member" || !user.memberId) return { ok: false, response: forbidden() };
  if (!isDatabaseConfigured()) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 }) };
  }
  const member = await getPrisma().member.findUnique({ where: { id: user.memberId }, select: { tokenVersion: true } });
  // Deleted member, or sessions revoked since this token was minted.
  if (!member || (user.tokenVersion ?? 0) !== member.tokenVersion) return { ok: false, response: authRequired() };
  return { ok: true, user };
}

/** Member-scoped endpoints: signed in AND resolvable to a Member row.
 *
 *  Folds in the member-id resolution every /api/me handler needs, so the
 *  "which member is this?" policy — including what a member-less admin sees —
 *  lives in one place instead of being copied into each handler. */
export async function memberScopeGuard(): Promise<MemberScopeGuard> {
  const guard = await memberGuard();
  if (!guard.ok) return guard;
  // Resolution needs the database; without it the honest answer is 503, not
  // "no such member" — same ordering the handlers used before this existed.
  if (!isDatabaseConfigured()) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 }) };
  }
  const memberId = await resolveMemberIdForUser(guard.user);
  if (!memberId) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "No member profile for this account", code: "no_member" }, { status: 404 }),
    };
  }
  return { ok: true, user: guard.user, memberId };
}

/** Cron endpoints. The only caller is Vercel Cron (or an operator holding the
 *  secret) — there is no session, so this is the one guard that authenticates
 *  from a header. Centralised for the same reason as the session guards: an
 *  inlined copy is one edit away from drifting. */
export function cronGuard(request: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true };
}
