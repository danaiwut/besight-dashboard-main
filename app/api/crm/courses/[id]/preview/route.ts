import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { courseDetailForAdmin } from "@/lib/server/courses";
import { adminGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Read-only course payload shaped exactly like the customer page, for the
 *  CRM's preview drawer. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid course id" }, { status: 400 });
    const course = await courseDetailForAdmin(id);
    if (!course) return NextResponse.json({ ok: false, error: "Course not found" }, { status: 404 });
    return NextResponse.json({ ok: true, course });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load preview" }, { status: 500 });
  }
}
