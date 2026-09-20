import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toRewardTierDto } from "@/lib/server/crmDtos";
import { adminGuard, adminWriteGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

function fail(error: unknown, fallback: string, status = 400) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : fallback }, { status });
}

export async function GET() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const tiers = await getPrisma().rewardTier.findMany({ orderBy: [{ sortOrder: "asc" }, { threshold: "asc" }] });
    return NextResponse.json({ ok: true, tiers: tiers.map(toRewardTierDto) });
  } catch (error) {
    return fail(error, "Unable to load reward tiers", 500);
  }
}

/** Replace-all: the ladder is tiny (a handful of rows), so the admin editor
 *  sends the whole ladder and the server swaps it in one transaction. */
export async function PUT(request: NextRequest) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json() as { tiers?: Array<Record<string, unknown>> };
    if (!Array.isArray(body.tiers) || !body.tiers.length) {
      return NextResponse.json({ ok: false, error: "At least one tier is required" }, { status: 400 });
    }
    const seen = new Set<string>();
    const rows = body.tiers.map((raw, index) => {
      const key = String(raw.key || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
      if (!key) throw new Error(`Tier #${index + 1}: key is required`);
      if (seen.has(key)) throw new Error(`Tier key "${key}" is duplicated`);
      seen.add(key);
      const title = String(raw.title || "").trim();
      if (!title) throw new Error(`Tier "${key}": title is required`);
      const threshold = Number(raw.threshold);
      if (!Number.isFinite(threshold) || threshold < 0) throw new Error(`Tier "${key}": threshold must be a number >= 0`);
      const reward = String(raw.reward || "").trim();
      if (!reward) throw new Error(`Tier "${key}": reward is required`);
      return {
        key,
        title,
        titleEn: String(raw.titleEn || "").trim() || null,
        threshold,
        reward,
        rewardEn: String(raw.rewardEn || "").trim() || null,
        icon: String(raw.icon || "redeem").trim() || "redeem",
        image: String(raw.image || "").trim() || null,
        accent: String(raw.accent || "#2F6FED").trim() || "#2F6FED",
        sortOrder: Number.isInteger(Number(raw.sortOrder)) ? Number(raw.sortOrder) : index,
        active: raw.active === undefined ? true : Boolean(raw.active),
      };
    });
    const prisma = getPrisma();
    await prisma.$transaction(async (tx) => {
      await tx.rewardTier.deleteMany({});
      await tx.rewardTier.createMany({ data: rows });
    });
    const tiers = await prisma.rewardTier.findMany({ orderBy: [{ sortOrder: "asc" }, { threshold: "asc" }] });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, tiers: tiers.map(toRewardTierDto) });
  } catch (error) {
    return fail(error, "Unable to save reward tiers");
  }
}
