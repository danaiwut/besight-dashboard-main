import { createHash, randomBytes } from "node:crypto";
import { getPrisma } from "./prisma";

/* Admin setup tokens — the Admin equivalent of lib/server/claim.ts's
 * member tokens. Only minted server-side by an already-authenticated admin
 * (POST /api/crm/admins), never self-requested: there is no public
 * "resend my admin setup link" form, unlike /claim, because exposing one
 * would let anyone probe which addresses belong to admins. */

export const ADMIN_CLAIM_TOKEN_TTL_HOURS = 24;

/** Stored as a hash: a leaked database snapshot must not yield usable links. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAdminClaimToken(adminId: number): Promise<string> {
  const prisma = getPrisma();
  const token = randomBytes(32).toString("base64url");

  // One live link per admin: issuing a new one retires any earlier link.
  await prisma.adminClaimToken.updateMany({
    where: { adminId, usedAt: null },
    data: { usedAt: new Date() },
  });

  await prisma.adminClaimToken.create({
    data: {
      adminId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ADMIN_CLAIM_TOKEN_TTL_HOURS * 60 * 60 * 1000),
    },
  });
  return token;
}

export type AdminClaimTokenCheck = { ok: true; adminId: number; tokenId: number } | { ok: false };

export async function checkAdminClaimToken(token: string): Promise<AdminClaimTokenCheck> {
  if (!token) return { ok: false };
  const row = await getPrisma().adminClaimToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, adminId: true, expiresAt: true, usedAt: true },
  });
  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) return { ok: false };
  return { ok: true, adminId: row.adminId, tokenId: row.id };
}

export async function consumeAdminClaimToken(tokenId: number): Promise<void> {
  await getPrisma().adminClaimToken.update({ where: { id: tokenId }, data: { usedAt: new Date() } });
}
