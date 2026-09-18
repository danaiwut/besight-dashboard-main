import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toAdminDto } from "@/lib/server/crmDtos";
import { adminSettingsGuard } from "@/lib/session";


export const dynamic = "force-dynamic";

const ROLES = ["Admin", "Support", "Viewer"];

export async function GET() {
  const guard = await adminSettingsGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const records = await getPrisma().admin.findMany({ orderBy: { id: "asc" } });
    // Never expose passwordHash to the browser — only the fields the CRM UI needs.
    return NextResponse.json({ ok: true, admins: records.map(toAdminDto) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load Admins" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await adminSettingsGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    if (!name || !email) return NextResponse.json({ ok: false, error: "Name and email are required" }, { status: 400 });
    const role = String(body.role || "Support");
    if (!ROLES.includes(role)) return NextResponse.json({ ok: false, error: `Role must be one of: ${ROLES.join(", ")}` }, { status: 400 });
    const prisma = getPrisma();
    if (await prisma.admin.findUnique({ where: { email }, select: { id: true } })) {
      return NextResponse.json({ ok: false, error: "Email already exists" }, { status: 400 });
    }
    const admin = await prisma.admin.create({ data: { name, email, role, isOwner: false } });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, admin: toAdminDto(admin) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to create admin" }, { status: 400 });
  }
}
