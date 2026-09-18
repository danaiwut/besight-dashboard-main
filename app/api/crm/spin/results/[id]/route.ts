import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toSpinResultDto } from "@/lib/server/spin";
import { adminWriteGuard } from "@/lib/session";


export const dynamic = "force-dynamic";

const STATUSES = ["pending", "fulfilled", "cancelled"] as const;

/** Fulfils or cancels a spin. Cancelling refunds the BEC automatically — the
 *  balance only subtracts spins that are not cancelled. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid result id" }, { status: 400 });

    const body = await request.json().catch(() => ({})) as { status?: string; note?: string };
    if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) {
      return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
    }
    const status = body.status as (typeof STATUSES)[number];

    const prisma = getPrisma();
    const existing = await prisma.spinResult.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ ok: false, error: "Spin result not found" }, { status: 404 });

    const updated = await prisma.spinResult.update({
      where: { id },
      data: {
        status,
        fulfilledAt: status === "fulfilled" ? new Date() : null,
        ...(body.note !== undefined ? { note: String(body.note).trim() || null } : {}),
      },
      include: { prize: true, member: { select: { code: true, name: true, displayName: true } } },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, result: toSpinResultDto(updated) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update spin result" }, { status: 500 });
  }
}
