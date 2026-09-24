/* Public labels on the leaderboard. Shared by the board and the member's
   leaderboard-profile settings preview so both show exactly the same name. */

/** A member who never chose a display name did not agree to have their legal
 *  name shown to every other member, so it is abbreviated: "Somchai Wattana"
 *  becomes "Somchai W.". A chosen display name is shown as-is.
 *
 *  `Member.name` is not always a name: the CRM sync falls back to the email
 *  address when the upstream record has none, so an email-shaped value must
 *  never reach the board — those fall back to the pseudonymous member code. */
export function publicLabel(displayName: string | null, name: string, code: string): string {
  const chosen = displayName?.trim();
  if (chosen && !chosen.includes("@")) return chosen;

  const raw = name.trim();
  if (!raw || raw.includes("@")) return code;

  const [first, ...rest] = raw.split(/\s+/).filter(Boolean);
  if (!first) return code;
  return rest.length ? `${first} ${rest[rest.length - 1].charAt(0)}.` : first;
}
