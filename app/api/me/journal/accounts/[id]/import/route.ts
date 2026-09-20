import { NextRequest, NextResponse } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { bumpDataVersion } from "@/lib/server/dataVersion";
import { flagDuplicates, parseStatementCsv, toJournalTrade } from "@/lib/server/journal";
import { resolveMemberIdForUser } from "@/lib/server/authIdentity";
import { memberGuard } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

/** MT4/MT5 history import, two steps in one endpoint:
 *  1. `{ text }` → parse preview (`rows` + `errors`), nothing written.
 *  2. `{ text, confirm: [rowNumbers] }` → imports the chosen rows (skips
 *     duplicates via the ticket+closeTime key), returns what landed. */
export async function POST(request: NextRequest, { params }: Params) {
  const guard = await memberGuard();
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const memberId = await resolveMemberIdForUser(guard.user);
    if (!memberId) return NextResponse.json({ ok: false, error: "No member profile for this account" }, { status: 404 });
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    const prisma = getPrisma();
    const account = await prisma.journalAccount.findFirst({ where: { id, memberId }, select: { id: true } });
    if (!account) return NextResponse.json({ ok: false, error: "Journal account not found" }, { status: 404 });

    const body = await request.json().catch(() => ({})) as { text?: string; confirm?: number[] };
    const text = String(body.text || "");
    if (!text.trim()) return NextResponse.json({ ok: false, error: "วางข้อมูลหรืออัปโหลดไฟล์ก่อน", code: "empty" }, { status: 400 });
    if (text.length > 2_000_000) return NextResponse.json({ ok: false, error: "ไฟล์ใหญ่เกินไป (สูงสุด ~2MB)", code: "too_large" }, { status: 400 });

    const { rows, errors } = parseStatementCsv(text);
    const flagged = await flagDuplicates(id, rows);

    if (!Array.isArray(body.confirm)) {
      return NextResponse.json({ ok: true, preview: true, rows: flagged, errors });
    }

    const wanted = new Set(body.confirm.map(Number).filter((n) => Number.isInteger(n)));
    const chosen = flagged.filter((row) => wanted.has(row.rowNumber) && !row.duplicate && !row.error);
    if (!chosen.length) return NextResponse.json({ ok: false, error: "ไม่มีแถวที่นำเข้าได้", code: "nothing" }, { status: 400 });

    const created = await prisma.journalTrade.createMany({
      data: chosen.map((row) => ({
        accountId: id,
        externalKey: `${id}:${row.ticket}:${row.closeAt}`,
        ticket: row.ticket,
        symbol: row.symbol,
        side: row.side,
        openAt: new Date(row.openAt),
        closeAt: new Date(row.closeAt),
        openPrice: row.openPrice,
        closePrice: row.closePrice,
        lots: row.lots,
        pnl: row.pnl,
        commission: row.commission,
        swap: row.swap,
      })),
      skipDuplicates: true,
    });
    await bumpDataVersion();
    const fresh = await prisma.journalTrade.findMany({
      where: { accountId: id },
      orderBy: [{ closeAt: "desc" }, { openAt: "desc" }],
      take: 2000,
    });
    return NextResponse.json({ ok: true, imported: created.count, skipped: chosen.length - created.count, trades: fresh.map((row) => toJournalTrade(row)) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "นำเข้าไม่สำเร็จ" }, { status: 400 });
  }
}
