import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "./prisma";
import { hashPassword } from "./password";

/* Public self-registration.
 *
 * Every other Member row is provisioned by the CRM sync; this is the one path
 * that lets a brand-new visitor mint their own. To keep that from becoming an
 * account-takeover door, it only ever INSERTs — it must never be able to
 * attach a password to a row that already exists (that's what /claim is for,
 * and /claim proves ownership of the address via an emailed link first).
 * A findFirst-then-create race is closed by catching the unique-constraint
 * error from the create itself rather than trusting the pre-check alone. */

export const MIN_PASSWORD_LENGTH = 8;

export type RegisterResult =
  | { ok: true; memberId: number }
  | { ok: false; error: "email_taken" | "invalid" };

function generateMemberCode(): string {
  // WEB- prefix keeps self-registered codes visually distinct from the
  // CRM's own member codes in every admin list/table.
  return `WEB-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function registerMember(input: { name: string; email: string; password: string }): Promise<RegisterResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!name || !email || password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: "invalid" };

  const passwordHash = await hashPassword(password);
  const prisma = getPrisma();

  // A handful of attempts absorbs the (very unlikely) code collision without
  // ever retrying past an email conflict — that one is reported, not retried.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const member = await prisma.member.create({
        data: { name, email, passwordHash, code: generateMemberCode() },
        select: { id: true },
      });
      return { ok: true, memberId: member.id };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Which unique column tripped isn't in the same place for every
        // adapter: Postgres puts it in `meta.target` (a field-name array),
        // but the MariaDB driver adapter nests it as the index name instead
        // (meta.driverAdapterError.cause.constraint.index, e.g.
        // "Member_email_key") — so check the whole meta blob, not one shape.
        const metaText = JSON.stringify(error.meta ?? {}).toLowerCase();
        if (metaText.includes("email")) return { ok: false, error: "email_taken" };
        // Code collision — try again with a freshly generated one.
        continue;
      }
      throw error;
    }
  }
  return { ok: false, error: "invalid" };
}
