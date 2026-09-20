import { createHash, randomBytes } from "node:crypto";
import { getPrisma } from "./prisma";

/* Account-claim tokens.
 *
 * The CRM sync is the only thing that creates Members, so claiming never mints
 * an account — it proves control of the email address already on the row and
 * attaches a password to it. */

export const CLAIM_TOKEN_TTL_HOURS = 24;

/** Stored as a hash: a leaked database snapshot must not yield usable links. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createClaimToken(memberId: number): Promise<string> {
  const prisma = getPrisma();
  const token = randomBytes(32).toString("base64url");

  // One live link per member: issuing a new one retires any earlier link.
  await prisma.memberClaimToken.updateMany({
    where: { memberId, usedAt: null },
    data: { usedAt: new Date() },
  });

  await prisma.memberClaimToken.create({
    data: {
      memberId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + CLAIM_TOKEN_TTL_HOURS * 60 * 60 * 1000),
    },
  });
  return token;
}

export type ClaimTokenCheck = { ok: true; memberId: number; tokenId: number } | { ok: false };

export async function checkClaimToken(token: string): Promise<ClaimTokenCheck> {
  if (!token) return { ok: false };
  const row = await getPrisma().memberClaimToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, memberId: true, expiresAt: true, usedAt: true },
  });
  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) return { ok: false };
  return { ok: true, memberId: row.memberId, tokenId: row.id };
}

export async function consumeClaimToken(tokenId: number): Promise<void> {
  await getPrisma().memberClaimToken.update({ where: { id: tokenId }, data: { usedAt: new Date() } });
}
