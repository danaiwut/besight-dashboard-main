import { getPrisma, isDatabaseConfigured } from "./prisma";
import { verifyPassword } from "./password";

/* Maps an email to the one account it belongs to. Identity lives in the
   existing Member/Admin tables (no separate auth user store): admins win when
   an email exists in both, members are provisioned by the CRM sync — social
   sign-in only claims an existing row, it never creates one. */

export type AdminIdentity = { role: "admin"; adminId: number; email: string; name: string };
export type MemberIdentity = { role: "member"; memberId: number; email: string; name: string };
export type Identity = AdminIdentity | MemberIdentity;

export async function resolveIdentityByEmail(email: string): Promise<Identity | null> {
  if (!isDatabaseConfigured()) return null;
  const normalized = email.trim();
  if (!normalized) return null;
  const prisma = getPrisma();

  const admin = await prisma.admin.findFirst({
    where: { email: normalized },
    select: { id: true, name: true, email: true },
  });
  if (admin) return { role: "admin", adminId: admin.id, email: admin.email, name: admin.name };

  const member = await prisma.member.findFirst({
    where: { email: normalized },
    select: { id: true, name: true, displayName: true, email: true },
  });
  if (member?.email) {
    return { role: "member", memberId: member.id, email: member.email, name: member.displayName?.trim() || member.name };
  }
  return null;
}

/** Email + password sign-in (admins first, then members). Returns null on any
 *  mismatch — callers must not reveal which half failed. */
export async function verifyCredentials(email: string, password: string): Promise<Identity | null> {
  if (!isDatabaseConfigured()) return null;
  const prisma = getPrisma();

  const admin = await prisma.admin.findFirst({ where: { email: email.trim() } });
  if (admin && (await verifyPassword(password, admin.passwordHash))) {
    return { role: "admin", adminId: admin.id, email: admin.email, name: admin.name };
  }

  const member = await prisma.member.findFirst({ where: { email: email.trim() } });
  if (member?.email && (await verifyPassword(password, member.passwordHash))) {
    return { role: "member", memberId: member.id, email: member.email, name: member.displayName?.trim() || member.name };
  }
  return null;
}

/** The Member row a signed-in account acts as. Members carry their id in the
 *  session; an admin whose email also belongs to a member (the owner's own
 *  account, minted into both tables by the CRM sync) resolves to that member so
 *  the customer dashboard keeps working while the CRM sees them as admin. */
export async function resolveMemberIdForUser(user: SessionUserLike): Promise<number | null> {
  if (user.role === "member" && user.memberId) return user.memberId;
  if (user.role === "admin" && user.email && isDatabaseConfigured()) {
    const member = await getPrisma().member.findFirst({ where: { email: user.email }, select: { id: true } });
    return member?.id ?? null;
  }
  return null;
}

type SessionUserLike = { role?: "admin" | "member"; memberId?: number; email?: string | null };
