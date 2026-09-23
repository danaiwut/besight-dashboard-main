import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "./prisma";

/* Shared "mint a brand-new Member row" primitive — used by public
 *  credentials registration (lib/server/register.ts) and by social
 *  self-registration (resolveOrCreateMemberIdentityByEmail in
 *  authIdentity.ts). Every other Member row still comes from the CRM sync;
 *  these two are the only paths allowed to INSERT one on their own. */

/** WEB- prefix keeps self-registered codes visually distinct from the CRM's
 *  own member codes in every admin list/table. */
export function generateMemberCode(): string {
  return `WEB-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export type InsertMemberResult = { ok: true; memberId: number } | { ok: false; error: "email_taken" };

/** Inserts a new member, retrying on a member-code collision (vanishingly
 *  unlikely, but cheap to guard) — never on an email conflict, which is
 *  reported back instead since it means the row already belongs to
 *  someone. */
export async function insertNewMember(data: { name: string; email: string; passwordHash: string | null }): Promise<InsertMemberResult> {
  const prisma = getPrisma();

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const member = await prisma.member.create({
        data: { name: data.name, email: data.email, passwordHash: data.passwordHash, code: generateMemberCode() },
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
        continue; // code collision — try again with a freshly generated one
      }
      throw error;
    }
  }
  throw new Error("Could not generate a unique member code after 5 attempts");
}
