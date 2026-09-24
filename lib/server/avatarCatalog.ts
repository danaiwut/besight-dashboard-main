import { createHash } from "node:crypto";
import { getPrisma } from "./prisma";
import type { AvatarOptionDto } from "../leaderboardProfile";

/* Leaderboard avatar catalog (LeaderboardAvatarOption). Built-ins are static
   files; admin uploads are served by /api/leaderboard/avatar-options/[id] with a
   content-versioned URL so browsers can cache them hard. */

type OptionRow = { id: number; label: string; imageUrl: string | null; imageData: string | null; builtIn: boolean; active: boolean; sortOrder: number; updatedAt: Date };

export function optionUrl(row: Pick<OptionRow, "id" | "imageUrl" | "imageData" | "updatedAt">): string {
  if (row.imageUrl) return row.imageUrl;
  const v = createHash("sha1").update(`${row.updatedAt.getTime()}:${row.imageData?.length ?? 0}`).digest("hex").slice(0, 10);
  return `/api/leaderboard/avatar-options/${row.id}/?v=${v}`;
}

export function toAvatarOptionDto(row: OptionRow): AvatarOptionDto {
  return { id: row.id, label: row.label, url: optionUrl(row), builtIn: row.builtIn, active: row.active, sortOrder: row.sortOrder };
}

const LIST_SELECT = { id: true, label: true, imageUrl: true, imageData: false, builtIn: true, active: true, sortOrder: true, updatedAt: true } as const;

/** Catalog without the (large) image payloads — URLs only. */
export async function listAvatarOptions(activeOnly: boolean): Promise<AvatarOptionDto[]> {
  const rows = await getPrisma().leaderboardAvatarOption.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: LIST_SELECT,
  });
  return rows.map((row) => toAvatarOptionDto({ ...row, imageData: null }));
}

/** id → image URL for the active options among `ids`. */
export async function activeOptionUrls(ids: number[]): Promise<Map<number, string>> {
  if (!ids.length) return new Map();
  const rows = await getPrisma().leaderboardAvatarOption.findMany({
    where: { id: { in: [...new Set(ids)] }, active: true },
    select: { id: true, imageUrl: true, updatedAt: true },
  });
  return new Map(rows.map((row) => [row.id, optionUrl({ ...row, imageData: null })]));
}

/** Accepts a data URL of a web image; returns an error message otherwise. */
export function validateImageData(value: unknown, maxChars: number): { ok: true; dataUrl: string } | { ok: false; error: string } {
  if (typeof value !== "string" || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) {
    return { ok: false, error: "Image must be a PNG, JPG or WebP" };
  }
  if (value.length > maxChars) return { ok: false, error: "Image is too large" };
  return { ok: true, dataUrl: value };
}
