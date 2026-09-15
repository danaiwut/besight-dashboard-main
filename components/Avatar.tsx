import { initials, type Member } from "./crm/CrmContext";

/** Shared avatar bubble: the member's uploaded photo when set, else their
 *  initials on the brand gradient — used anywhere `.avatar` was previously
 *  hardcoded to `initials(member.name)`, so a photo uploaded on the profile
 *  page shows up everywhere the account is represented. */
export default function Avatar({ member, size = 38, className }: { member: Member; size?: number; className?: string }) {
  return (
    <span className={`avatar${className ? ` ${className}` : ""}`} style={{ width: size, height: size }}>
      {member.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded data URL, not a static asset Next can optimize
        <img src={member.avatarUrl} alt="" />
      ) : (
        initials(member.name)
      )}
    </span>
  );
}
