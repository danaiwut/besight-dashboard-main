import { NextRequest, NextResponse } from "next/server";
import { persistLotCheckAndAutomate } from "@/lib/server/indicatorAutomation";
import { fetchLotChecks } from "@/lib/server/lotCheck";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to check lots";
  const isInputError = message.includes("date_") || message.includes("YYYY-MM-DD");
  return NextResponse.json({ ok: false, error: message }, { status: isInputError ? 400 : 502 });
}

export async function GET(request: NextRequest) {
  try {
    const dateFrom = request.nextUrl.searchParams.get("date_from") || "";
    const dateTo = request.nextUrl.searchParams.get("date_to") || "";
    const tradeId = request.nextUrl.searchParams.get("tradeid") || undefined;
    const data = await fetchLotChecks(dateFrom, dateTo, tradeId);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { dateFrom?: string; dateTo?: string; tradeId?: string; autoGrant?: boolean };
    const dateFrom = body.dateFrom || "";
    const dateTo = body.dateTo || "";
    const tradeId = body.tradeId?.trim() || undefined;
    const data = await fetchLotChecks(dateFrom, dateTo, tradeId);
    const automation = await persistLotCheckAndAutomate({
      tradeId,
      dateFrom,
      dateTo,
      data,
      autoGrant: body.autoGrant !== false,
    });
    return NextResponse.json({ ok: true, data, automation });
  } catch (error) {
    return errorResponse(error);
  }
}
