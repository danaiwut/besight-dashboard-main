import { NextResponse } from "next/server";
import { syncCustomerMembers } from "@/lib/server/customerSync";
import { adminWriteGuard } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await adminWriteGuard();
  if (!guard.ok) return guard.response;
  try {
    const result = await syncCustomerMembers();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sync CRM customers";
    const status = message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export const POST = GET;
