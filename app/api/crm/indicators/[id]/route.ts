import { NextRequest, NextResponse } from "next/server";
import { RecordStatus } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toIndicatorDto } from "@/lib/server/crmDtos";
import { adminWriteGuard } from "@/lib/session";
import { normalizeEaUrl } from "@/lib/server/eaPolicy";


export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid indicator id" }, { status: 400 });
    const prisma = getPrisma();
    const current = await prisma.indicator.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ ok: false, error: "Indicator not found" }, { status: 404 });

    const body = await request.json() as Record<string, unknown>;
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
      const clash = await prisma.indicator.findUnique({ where: { name }, select: { id: true } });
      if (clash && clash.id !== id) return NextResponse.json({ ok: false, error: `Indicator ${name} already exists` }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.publicationId !== undefined || body.pubId !== undefined) {
      data.publicationId = String(body.publicationId ?? body.pubId ?? "").trim() || null;
    }
    if (body.status !== undefined) data.status = body.status === "inactive" ? RecordStatus.inactive : RecordStatus.active;
    if (body.eaFileUrl !== undefined || body.eaFile !== undefined) {
      const ea = normalizeEaUrl(body.eaFileUrl ?? body.eaFile);
      if (!ea.ok) return NextResponse.json({ ok: false, error: ea.error }, { status: 400 });
      data.eaFileUrl = ea.url;
    }

    const indicator = await prisma.indicator.update({ where: { id }, data });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, indicator: toIndicatorDto(indicator) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update indicator" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid indicator id" }, { status: 400 });
    const prisma = getPrisma();
    const existing = await prisma.indicator.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ ok: false, error: "Indicator not found" }, { status: 404 });
    // Access rows cascade with the indicator; the UI additionally blocks
    // deleting indicators that members currently use.
    await prisma.indicator.delete({ where: { id } });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to delete indicator" }, { status: 400 });
  }
}
