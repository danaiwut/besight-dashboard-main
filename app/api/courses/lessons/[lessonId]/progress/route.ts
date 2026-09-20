import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberGuard } from "@/lib/session";
import { recordWatchProgress } from "@/lib/server/courses";
import { memberLevelFor } from "@/lib/server/memberLevel";
import { levelAtLeast } from "@/lib/memberLevel";

export const dynamic = "force-dynamic";

/** Watch heartbeat: records the furthest video-clock position (monotonic).
 *  Never completes anything — completion is the explicit tick endpoint, which
 *  verifies ≥90% watched server-side. Same level gate as the tick. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = await resolveMemberIdForUser(guard.user);
    if (!memberId) return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });

    const lessonId = Number((await params).lessonId);
    if (!Number.isInteger(lessonId) || lessonId <= 0) return NextResponse.json({ ok: false, error: "Invalid lesson id" }, { status: 400 });

    const body = await request.json().catch(() => ({})) as { positionSec?: number; durationSec?: number | null };
    const positionSec = Number(body.positionSec);
    const durationSec = body.durationSec == null ? null : Number(body.durationSec);
    if (!Number.isFinite(positionSec) || positionSec < 0 || positionSec > 24 * 3600) {
      return NextResponse.json({ ok: false, error: "Invalid position" }, { status: 400 });
    }
    if (durationSec !== null && (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > 24 * 3600)) {
      return NextResponse.json({ ok: false, error: "Invalid duration" }, { status: 400 });
    }

    const prisma = getPrisma();
    const lesson = await prisma.courseLesson.findUnique({
      where: { id: lessonId },
      select: { id: true, course: { select: { published: true, minLevel: true } } },
    });
    if (!lesson || !lesson.course.published) return NextResponse.json({ ok: false, error: "Lesson not found" }, { status: 404 });

    const level = await memberLevelFor(memberId);
    if (!levelAtLeast(level, lesson.course.minLevel)) {
      return NextResponse.json({ ok: false, error: "ระดับสมาชิกของคุณยังไม่ถึงเกณฑ์ของคอร์สนี้", code: "level_required" }, { status: 403 });
    }

    const { watchedPct } = await recordWatchProgress(memberId, lessonId, positionSec, durationSec);
    return NextResponse.json({ ok: true, watchedPct });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to record progress" }, { status: 400 });
  }
}
