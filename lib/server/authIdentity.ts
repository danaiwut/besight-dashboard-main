import { getPrisma, isDatabaseConfigured } from "./prisma";
import { verifyPassword } from "./password";
import { insertNewMember } from "./memberProvisioning";

/* Maps an email to the one account it belongs to. Identity lives in the
   existing Member/Admin tables (no separate auth user store): members are
   provisioned by the CRM sync — signing in only claims an existing row, it
   never creates one. */

export type AdminIdentity = { role: "admin"; adminId: number; email: string; name: string; tokenVersion: number };
export type MemberIdentity = { role: "member"; memberId: number; email: string; name: string; tokenVersion: number };
export type Identity = AdminIdentity | MemberIdentity;

/** Member-only lookup, used by the social sign-in path.
 *
 *  Admins are deliberately NOT resolvable here. An admin account is reached
 *  with its password (Admin.passwordHash) and nothing else, so controlling an
 *  identity provider account that happens to share an admin's email address
 *  cannot yield CRM access. The previous admin-first lookup made every OAuth
 *  provider a password-free door into the backoffice. */
export async function resolveMemberIdentityByEmail(email: string): Promise<MemberIdentity | null> {
  if (!isDatabaseConfigured()) return null;
  const normalized = email.trim();
  if (!normalized) return null;

  const member = await getPrisma().member.findFirst({
    where: { email: normalized },
    select: { id: true, name: true, displayName: true, email: true, tokenVersion: true },
  });
  if (!member?.email) return null;
  return { role: "member", memberId: member.id, email: member.email, name: member.displayName?.trim() || member.name, tokenVersion: member.tokenVersion };
}

/** Social sign-in's self-registration path: claim an existing member row by
 *  email as before, or — if no row owns that address yet — mint a brand-new
 *  one, the Google-sign-in equivalent of the public /signup form.
 *  `passwordHash` stays null (social-login only) until the person sets one
 *  through /claim.
 *
 *  SECURITY: only call this for a provider whose email the caller has
 *  already confirmed is independently verified (auth.ts gates this on
 *  `profile.email_verified === true` before calling in). Without that
 *  check, this would let anyone mint an account under an address they
 *  don't own — the entire reason /claim proves ownership via an emailed
 *  link instead of trusting the address outright. */
export async function resolveOrCreateMemberIdentityByEmail(email: string, name: string): Promise<MemberIdentity | null> {
  if (!isDatabaseConfigured()) return null;
  const normalized = email.trim();
  if (!normalized) return null;

  const existing = await resolveMemberIdentityByEmail(normalized);
  if (existing) return existing;

  const displayName = name.trim() || normalized.split("@")[0];
  const created = await insertNewMember({ name: displayName, email: normalized, passwordHash: null });
  if (!created.ok) {
    // Lost a race with another sign-in/register for the same address
    // between the lookup above and this insert — re-resolve rather than
    // fail the sign-in outright.
    return resolveMemberIdentityByEmail(normalized);
  }
  return { role: "member", memberId: created.memberId, email: normalized, name: displayName, tokenVersion: 0 };
}

/** Email + password sign-in (admins first, then members). Returns null on any
 *  mismatch — callers must not reveal which half failed. */
export async function verifyCredentials(email: string, password: string): Promise<Identity | null> {
  if (!isDatabaseConfigured()) return null;
  const prisma = getPrisma();

  const admin = await prisma.admin.findFirst({ where: { email: email.trim() } });
  if (admin && (await verifyPassword(password, admin.passwordHash))) {
    return { role: "admin", adminId: admin.id, email: admin.email, name: admin.name, tokenVersion: admin.tokenVersion };
  }

  const member = await prisma.member.findFirst({ where: { email: email.trim() } });
  if (member?.email && (await verifyPassword(password, member.passwordHash))) {
    return { role: "member", memberId: member.id, email: member.email, name: member.displayName?.trim() || member.name, tokenVersion: member.tokenVersion };
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
