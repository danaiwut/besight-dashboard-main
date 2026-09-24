/* Member-chosen public leaderboard profile. Stored as JSON on
   Member.leaderboardProfileJson; parsed + validated here so the API, the
   leaderboard and the settings page share one shape. Client-safe. */

export const LEADERBOARD_AVATAR_PRESETS = 12;
/** Uploaded leaderboard photos are downscaled client-side to this square. */
export const LEADERBOARD_PHOTO_PX = 128;
/** Hard cap on the stored data URL (~a 128px JPEG is 5-15 KB). */
export const LEADERBOARD_PHOTO_MAX_CHARS = 60_000;
export const LEADERBOARD_NICKNAME_MAX = 32;

export type LeaderboardAvatar =
  | { kind: "initials" }
  | { kind: "preset"; preset: number }
  | { kind: "photo"; dataUrl: string };

export type LeaderboardProfile = {
  /** Shown instead of the (abbreviated) name. Empty = default label. */
  nickname: string;
  avatar: LeaderboardAvatar;
  showCode: boolean;
  showSymbols: boolean;
  /** Still ranked, but shown as an anonymous trader with no code/avatar. */
  anonymous: boolean;
};

export const DEFAULT_LEADERBOARD_PROFILE: LeaderboardProfile = {
  nickname: "",
  avatar: { kind: "initials" },
  showCode: true,
  showSymbols: true,
  anonymous: false,
};

function parseAvatar(value: unknown): LeaderboardAvatar {
  if (!value || typeof value !== "object") return { kind: "initials" };
  const v = value as Record<string, unknown>;
  if (v.kind === "preset") {
    const preset = Number(v.preset);
    if (Number.isInteger(preset) && preset >= 1 && preset <= LEADERBOARD_AVATAR_PRESETS) return { kind: "preset", preset };
  }
  if (v.kind === "photo" && typeof v.dataUrl === "string"
    && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v.dataUrl)
    && v.dataUrl.length <= LEADERBOARD_PHOTO_MAX_CHARS) {
    return { kind: "photo", dataUrl: v.dataUrl };
  }
  return { kind: "initials" };
}

/** Lenient: anything invalid falls back to the default for that field. */
export function normalizeLeaderboardProfile(input: unknown): LeaderboardProfile {
  if (!input || typeof input !== "object") return { ...DEFAULT_LEADERBOARD_PROFILE };
  const v = input as Record<string, unknown>;
  const nickname = typeof v.nickname === "string"
    ? v.nickname.replace(/\s+/g, " ").trim().slice(0, LEADERBOARD_NICKNAME_MAX)
    : "";
  return {
    // An email-shaped nickname would leak the address to every member.
    nickname: nickname.includes("@") ? "" : nickname,
    avatar: parseAvatar(v.avatar),
    showCode: v.showCode !== false,
    showSymbols: v.showSymbols !== false,
    anonymous: v.anonymous === true,
  };
}

export function parseLeaderboardProfile(json: string | null | undefined): LeaderboardProfile {
  if (!json) return { ...DEFAULT_LEADERBOARD_PROFILE };
  try {
    return normalizeLeaderboardProfile(JSON.parse(json));
  } catch {
    return { ...DEFAULT_LEADERBOARD_PROFILE };
  }
}

/** What the leaderboard sends for a row's avatar (null = initials). */
export type LeaderboardAvatarDto = { kind: "preset"; preset: number } | { kind: "photo"; url: string } | null;

export function avatarDto(avatar: LeaderboardAvatar): LeaderboardAvatarDto {
  if (avatar.kind === "preset") return { kind: "preset", preset: avatar.preset };
  if (avatar.kind === "photo") return { kind: "photo", url: avatar.dataUrl };
  return null;
}
