import Icon from "../Icon";
import type { LeaderboardAvatarDto } from "../../lib/leaderboardProfile";

/** Up to two initials from the letter-bearing words of a public label, so
 *  "earn🌿 | 351664490" gives "E" and "#B lieve" gives "BL" (not "E|"/"#L").
 *  Falls back to the first digit, then "?". */
function letterInitials(name: string): string {
  // Letters only; Thai leading vowels (เ แ โ ใ ไ) are skipped so "แอดมิน" → "อ".
  const words = name.split(/\s+/).map((w) => w.replace(/[^\p{L}]|[\u0E40-\u0E44]/gu, "")).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => [...w][0]).join("");
  if (letters) return letters.toUpperCase();
  return name.match(/\d/)?.[0] ?? "?";
}

/** A member's leaderboard avatar as they chose it in Settings: their own
 *  photo, an avatar from the admin-managed catalog, or their initials. Anonymous members
 *  get a neutral icon. Fills its (round, sized-by-CSS) container. */
export default function LeaderboardAvatar({ avatar, name, anonymous }: { avatar: LeaderboardAvatarDto; name: string; anonymous?: boolean }) {
  if (anonymous) return <span className="lbd-avatar-fallback"><Icon name="person" /></span>;
  if (avatar?.url) {
    // eslint-disable-next-line @next/next/no-img-element -- member-chosen avatar, tiny image served by our API / public dir
    return <img src={avatar.url} alt={name} loading="lazy" />;
  }
  return <span className="lbd-avatar-fallback">{letterInitials(name)}</span>;
}
