import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { toActivityEnrollmentDto } from "@/lib/server/crmDtos";
import { adminWriteGuard } from "@/lib/session";


export const dynamic = "force-dynamic";

/** Admin review of one registration: approve/reject the competition account
 *  and/or set its lots by hand (the fallback until a demo lot source exists). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; enrollmentId: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const activityId = Number((await params).id);
    const enrollmentId = Number((await params).enrollmentId);
    if (!Number.isInteger(activityId) || activityId <= 0 || !Number.isInteger(enrollmentId) || enrollmentId <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }
    const prisma = getPrisma();
    const enrollment = await prisma.activityEnrollment.findUnique({ where: { id: enrollmentId }, select: { id: true, activityId: true } });
    if (!enrollment || enrollment.activityId !== activityId) {
      return NextResponse.json({ ok: false, error: "Enrollment not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({})) as { verified?: boolean; lots?: number; note?: string };
    const data: Record<string, unknown> = {};
    if (body.verified !== undefined) {
      data.verifiedAt = body.verified ? new Date() : null;
      data.verificationNote = String(body.note || "").trim() || (body.verified ? "อนุมัติโดยแอดมิน" : "ไม่ผ่านการตรวจสอบโดยแอดมิน");
    } else if (body.note !== undefined) {
      data.verificationNote = String(body.note).trim() || null;
    }
    if (body.lots !== undefined) {
      const lots = Number(body.lots);
      if (!Number.isFinite(lots) || lots < 0) return NextResponse.json({ ok: false, error: "Invalid lots" }, { status: 400 });
      data.lots = lots;
      data.lotsAt = new Date();
      data.checkError = null;
    }

    const updated = await prisma.activityEnrollment.update({
      where: { id: enrollmentId },
      data,
      include: { member: { select: { code: true, name: true, displayName: true, email: true } } },
    });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, enrollment: toActivityEnrollmentDto(updated) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update enrollment" }, { status: 500 });
  }
}

/** Removes one member's registration from an activity. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; enrollmentId: string }> }) {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const activityId = Number((await params).id);
    const enrollmentId = Number((await params).enrollmentId);
    if (!Number.isInteger(activityId) || activityId <= 0 || !Number.isInteger(enrollmentId) || enrollmentId <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }
    const prisma = getPrisma();
    const enrollment = await prisma.activityEnrollment.findUnique({ where: { id: enrollmentId }, select: { id: true, activityId: true } });
    if (!enrollment || enrollment.activityId !== activityId) {
      return NextResponse.json({ ok: false, error: "Enrollment not found" }, { status: 404 });
    }
    await prisma.activityEnrollment.delete({ where: { id: enrollmentId } });
    await bumpDataVersion();
    return NextResponse.json({ ok: true, id: enrollmentId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to remove participant" }, { status: 500 });
  }
}
