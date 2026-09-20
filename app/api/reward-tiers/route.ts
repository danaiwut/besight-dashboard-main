import { NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { toRewardTierDto } from "@/lib/server/crmDtos";
import { memberGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Public loyalty ladder — active tiers only, lowest threshold first. */
export async function GET() {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const tiers = await getPrisma().rewardTier.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { threshold: "asc" }],
    });
    return NextResponse.json({ ok: true, tiers: tiers.map(toRewardTierDto) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load tiers" }, { status: 500 });
  }
}
