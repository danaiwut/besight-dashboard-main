import { NextRequest, NextResponse } from "next/server";
import { syncCustomerMembers } from "@/lib/server/customerSync";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { cronGuard } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* Vercel Cron (every 15min): runs the Supabase customer replace-sync in the
   background so the member list never goes stale during long admin sessions.
   saveCustomers() already bumps the data version, so live tabs reload via the
   10s version poll. Manual Re-sync in the UI still forces an immediate run. */
export async function GET(request: NextRequest) {
  const guard = cronGuard(request);
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  }
  try {
    const result = await syncCustomerMembers();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Customer sync failed";
    const status = message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
