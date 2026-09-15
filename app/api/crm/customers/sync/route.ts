import { NextResponse } from "next/server";
import { syncCustomerMembers } from "@/lib/server/customerSync";

export const dynamic = "force-dynamic";

export async function GET() {
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
