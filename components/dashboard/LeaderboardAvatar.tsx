import { initials } from "../crm/CrmContext";
import Icon from "../Icon";
import type { LeaderboardAvatarDto } from "../../lib/leaderboardProfile";

/** A member's leaderboard avatar as they chose it in Settings: their own
 *  photo, one of the preset portraits, or their initials. Anonymous members
 *  get a neutral icon. Fills its (round, sized-by-CSS) container. */
export default function LeaderboardAvatar({ avatar, name, anonymous }: { avatar: LeaderboardAvatarDto; name: string; anonymous?: boolean }) {
  if (anonymous) return <span className="lbd-avatar-fallback"><Icon name="person" /></span>;
  if (avatar?.kind === "photo" || avatar?.kind === "preset") {
    const src = avatar.kind === "photo" ? avatar.url : `/img/avatars/avatar-${avatar.preset}.png`;
    // eslint-disable-next-line @next/next/no-img-element -- member-chosen avatar, tiny image served by our API / public dir
    return <img src={src} alt={name} loading="lazy" />;
  }
  return <span className="lbd-avatar-fallback">{initials(name || "?")}</span>;
}
