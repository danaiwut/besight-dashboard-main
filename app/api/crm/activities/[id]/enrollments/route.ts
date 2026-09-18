import { NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { toActivityEnrollmentDto } from "@/lib/server/crmDtos";
import { adminGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Registrations for one activity — the CRM's participant list. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid activity id" }, { status: 400 });

    const prisma = getPrisma();
    const activity = await prisma.activity.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!activity) return NextResponse.json({ ok: false, error: "Activity not found" }, { status: 404 });

    const rows = await prisma.activityEnrollment.findMany({
      where: { activityId: id },
      orderBy: { createdAt: "desc" },
      include: { member: { select: { code: true, name: true, displayName: true, email: true } } },
    });
    return NextResponse.json({ ok: true, activity, enrollments: rows.map(toActivityEnrollmentDto) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load participants" }, { status: 500 });
  }
}
