import { getPrisma } from "./prisma";

/* Session revocation for the stateless-JWT strategy.
 *
 * There is no session table to delete rows from, so every account carries a
 * `tokenVersion`. The guards in lib/session.ts compare the value baked into the
 * JWT against the current row, and a bump therefore invalidates every token
 * already issued — the "sign out everywhere" a JWT cannot otherwise express.
 *
 * Call this whenever the credentials behind a session change hands: password
 * set or reset, or an operator forcing a sign-out. */

export async function revokeMemberSessions(memberId: number): Promise<void> {
  await getPrisma().member.update({ where: { id: memberId }, data: { tokenVersion: { increment: 1 } } });
}

export async function revokeAdminSessions(adminId: number): Promise<void> {
  await getPrisma().admin.update({ where: { id: adminId }, data: { tokenVersion: { increment: 1 } } });
}
