import { NextRequest, NextResponse } from "next/server";
import { RecordStatus } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toBrokerDto } from "@/lib/server/crmDtos";
import { adminGuard, adminWriteGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const records = await getPrisma().broker.findMany({ orderBy: { id: "asc" } });
    return NextResponse.json({ ok: true, brokers: records.map(toBrokerDto) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load Brokers" }, { status: 500 });
  }
}

async function generateCode(name: string): Promise<string> {
  const prisma = getPrisma();
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "BRK";
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = attempt ? `${base}-${attempt}` : base;
    if (!(await prisma.broker.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new Error("Unable to generate a unique broker code");
}

export async function POST(request: NextRequest) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
    const prisma = getPrisma();
    const code = String(body.code || "").trim() || (await generateCode(name));
    if (await prisma.broker.findUnique({ where: { code }, select: { id: true } })) {
      return NextResponse.json({ ok: false, error: `Broker code ${code} already exists` }, { status: 400 });
    }
    const broker = await prisma.broker.create({
      data: {
        name,
        code,
        logoUrl: String(body.logo ?? body.logoUrl ?? "").trim() || null,
        url: String(body.url || "").trim() || null,
        status: body.status === "inactive" ? RecordStatus.inactive : RecordStatus.active,
        importMethod: String(body.importMethod || "").trim() || null,
      },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, broker: toBrokerDto(broker) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to create broker" }, { status: 400 });
  }
}
