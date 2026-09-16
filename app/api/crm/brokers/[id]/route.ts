import { NextRequest, NextResponse } from "next/server";
import { RecordStatus } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toBrokerDto } from "@/lib/server/crmDtos";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid broker id" }, { status: 400 });
    const prisma = getPrisma();
    const current = await prisma.broker.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ ok: false, error: "Broker not found" }, { status: 404 });

    const body = await request.json() as Record<string, unknown>;
    if (body.name !== undefined && !String(body.name).trim()) {
      return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
    }
    if (body.code !== undefined) {
      const code = String(body.code).trim();
      if (!code) return NextResponse.json({ ok: false, error: "Code is required" }, { status: 400 });
      const clash = await prisma.broker.findUnique({ where: { code }, select: { id: true } });
      if (clash && clash.id !== id) return NextResponse.json({ ok: false, error: `Broker code ${code} already exists` }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.code !== undefined) data.code = String(body.code).trim();
    if (body.logo !== undefined || body.logoUrl !== undefined) data.logoUrl = String(body.logo ?? body.logoUrl ?? "").trim() || null;
    if (body.url !== undefined) data.url = String(body.url).trim() || null;
    if (body.status !== undefined) data.status = body.status === "inactive" ? RecordStatus.inactive : RecordStatus.active;
    if (body.importMethod !== undefined) data.importMethod = String(body.importMethod).trim() || null;

    const broker = await prisma.broker.update({ where: { id }, data });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, broker: toBrokerDto(broker) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update broker" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid broker id" }, { status: 400 });
    const prisma = getPrisma();
    const existing = await prisma.broker.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ ok: false, error: "Broker not found" }, { status: 404 });
    // Trade accounts keep their history with brokerId detached (SetNull).
    await prisma.broker.delete({ where: { id } });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to delete broker" }, { status: 400 });
  }
}
