import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberGuard } from "@/lib/session";
import { SpinError, performSpin, spinPageData } from "@/lib/server/spin";

export const dynamic = "force-dynamic";

/** Everything the customer spin page needs: BEC balance (earned from real
 *  trades − spent on spins), the active wheel prizes, and recent results. */
export async function GET() {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = await resolveMemberIdForUser(guard.user);
    if (!memberId) return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });
    const data = await spinPageData(memberId);
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load spin data" }, { status: 500 });
  }
}

/** Performs one spin: the server picks the prize (weighted, stock-aware) and
 *  records the BEC spend. The client only animates the wheel to that prize. */
export async function POST() {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = await resolveMemberIdForUser(guard.user);
    if (!memberId) return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });
    const outcome = await performSpin(memberId);
    return NextResponse.json({ ok: true, ...outcome });
  } catch (error) {
    if (error instanceof SpinError) {
      const status = error.code === "insufficient_bec" ? 409 : error.code === "no_prizes" ? 409 : 403;
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "หมุนไม่สำเร็จ" }, { status: 500 });
  }
}
