import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { readDataVersion } from "@/lib/server/dataVersion";
import { adminGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Realtime counter for the CRM provider (see ADR-001). Cheap single-row
 *  read — clients poll this and re-fetch datasets only when it moves. */
export async function GET() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, version: await readDataVersion() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to read data version" }, { status: 500 });
  }
}
