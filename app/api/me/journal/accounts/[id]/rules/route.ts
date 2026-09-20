import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toRiskRuleDto } from "@/lib/server/journal";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function ownAccount(memberId: number, id: number) {
  return getPrisma().journalAccount.findFirst({ where: { id, memberId }, select: { id: true } });
}

export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = await resolveMemberIdForUser(guard.user);
    if (!memberId) return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    if (!(await ownAccount(memberId, id))) return NextResponse.json({ ok: false, error: "Journal account not found" }, { status: 404 });
    const rule = await getPrisma().riskRule.findUnique({ where: { accountId: id } });
    return NextResponse.json({ ok: true, rules: toRiskRuleDto(rule) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load rules" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = await resolveMemberIdForUser(guard.user);
    if (!memberId) return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    if (!(await ownAccount(memberId, id))) return NextResponse.json({ ok: false, error: "Journal account not found" }, { status: 404 });

    const body = await request.json().catch(() => ({})) as {
      maxDailyLoss?: number; maxLoss?: number; profitTarget?: number;
    };
    const data: Record<string, number> = {};
    for (const field of ["maxDailyLoss", "maxLoss", "profitTarget"] as const) {
      if (body[field] === undefined) continue;
      const value = Math.abs(Number(body[field]));
      if (!Number.isFinite(value) || value <= 0) {
        return NextResponse.json({ ok: false, error: `Invalid ${field}` }, { status: 400 });
      }
      data[field] = Math.round(value * 100) / 100;
    }
    if (!Object.keys(data).length) return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
    const rule = await getPrisma().riskRule.upsert({
      where: { accountId: id },
      update: data,
      create: { accountId: id, ...data },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, rules: toRiskRuleDto(rule) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save rules" }, { status: 400 });
  }
}
