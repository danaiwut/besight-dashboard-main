import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberGuard } from "@/lib/session";
import { courseDetail } from "@/lib/server/courses";

export const dynamic = "force-dynamic";

/** One published course with its lessons and the member's progress. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const { slug } = await params;
    const memberId = await resolveMemberIdForUser(guard.user);
    const course = await courseDetail(slug, memberId);
    if (!course) return NextResponse.json({ ok: false, error: "Course not found" }, { status: 404 });
    return NextResponse.json({ ok: true, course });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load course" }, { status: 500 });
  }
}
