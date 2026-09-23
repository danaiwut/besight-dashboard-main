import { insertNewMember } from "./memberProvisioning";
import { hashPassword } from "./password";

/* Public self-registration (email + password).
 *
 * Every other Member row is provisioned by the CRM sync; this is one of two
 * paths (the other being social self-registration in authIdentity.ts) that
 * let a brand-new visitor mint their own row. insertNewMember never attaches
 * a password to a row that already exists — that's what /claim is for, and
 * /claim proves ownership of the address via an emailed link first. */

export const MIN_PASSWORD_LENGTH = 8;

export type RegisterResult =
  | { ok: true; memberId: number }
  | { ok: false; error: "email_taken" | "invalid" };

export async function registerMember(input: { name: string; email: string; password: string }): Promise<RegisterResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!name || !email || password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: "invalid" };

  const passwordHash = await hashPassword(password);
  const result = await insertNewMember({ name, email, passwordHash });
  if (!result.ok) return { ok: false, error: "email_taken" };
  return { ok: true, memberId: result.memberId };
}
