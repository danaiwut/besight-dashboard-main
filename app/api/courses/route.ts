import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberGuard } from "@/lib/session";
import { listCourses } from "@/lib/server/courses";

export const dynamic = "force-dynamic";

/** Published catalog with each course's progress for the signed-in member. */
export async function GET() {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = await resolveMemberIdForUser(guard.user);
    const { level, courses } = await listCourses(memberId);
    return NextResponse.json({ ok: true, level, courses });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load courses" }, { status: 500 });
  }
}
