import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toAdminDto } from "@/lib/server/crmDtos";
import { adminSettingsGuard } from "@/lib/session";


export const dynamic = "force-dynamic";

const ROLES = ["Admin", "Support", "Viewer"];

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminSettingsGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid admin id" }, { status: 400 });
    const prisma = getPrisma();
    const current = await prisma.admin.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ ok: false, error: "Admin not found" }, { status: 404 });
    if (current.isOwner) return NextResponse.json({ ok: false, error: "The owner account cannot be modified" }, { status: 403 });

    const body = await request.json() as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (!String(body.name).trim()) return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
      data.name = String(body.name).trim();
    }
    if (body.email !== undefined) {
      const email = String(body.email).trim();
      if (!email) return NextResponse.json({ ok: false, error: "Email is required" }, { status: 400 });
      const clash = await prisma.admin.findUnique({ where: { email }, select: { id: true } });
      if (clash && clash.id !== id) return NextResponse.json({ ok: false, error: "Email already exists" }, { status: 400 });
      data.email = email;
    }
    if (body.role !== undefined) {
      const role = String(body.role);
      if (!ROLES.includes(role)) return NextResponse.json({ ok: false, error: `Role must be one of: ${ROLES.join(", ")}` }, { status: 400 });
      data.role = role;
    }

    const admin = await prisma.admin.update({ where: { id }, data });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, admin: toAdminDto(admin) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update admin" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminSettingsGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid admin id" }, { status: 400 });
    const prisma = getPrisma();
    const current = await prisma.admin.findUnique({ where: { id }, select: { id: true, isOwner: true } });
    if (!current) return NextResponse.json({ ok: false, error: "Admin not found" }, { status: 404 });
    if (current.isOwner) return NextResponse.json({ ok: false, error: "The owner account cannot be removed" }, { status: 403 });
    await prisma.admin.delete({ where: { id } });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to delete admin" }, { status: 400 });
  }
}
