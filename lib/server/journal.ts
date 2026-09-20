import { getPrisma } from "./prisma";
import type { ImportPreviewRow, InsightDto, JournalAccountDto, JournalTrade, RiskRuleDto } from "../journal";

/* ── Trading Journal server helpers ──
    CSV import parsing + rule-based insights. Stats themselves stay
    client-side (lib/journal.ts) over the loaded trade rows. */

// ── DTOs ────────────────────────────────────────────────────────────────

function tagsOf(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    const parsed: unknown = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function toJournalTrade(row: {
  id: number | bigint; accountId: number; ticket: string | null; symbol: string; side: string;
  openAt: Date; closeAt: Date | null; openPrice: unknown; closePrice: unknown; tp: unknown; sl: unknown;
  lots: unknown; pnl: unknown; commission: unknown; swap: unknown; note: string | null; tagsJson: string;
}): JournalTrade {
  const num = (v: unknown) => (typeof v === "object" && v !== null && "toNumber" in v ? (v as { toNumber: () => number }).toNumber() : Number(v));
  return {
    id: Number(row.id),
    accountId: row.accountId,
    ticket: row.ticket || undefined,
    symbol: row.symbol,
    side: row.side === "sell" ? "sell" : "buy",
    openDate: row.openAt.toISOString(),
    closeDate: row.closeAt ? row.closeAt.toISOString() : "",
    openPrice: num(row.openPrice),
    closePrice: row.closePrice != null ? num(row.closePrice) : 0,
    tp: row.tp != null ? num(row.tp) : null,
    sl: row.sl != null ? num(row.sl) : null,
    lots: num(row.lots),
    pnl: row.pnl != null ? num(row.pnl) : 0,
    commission: num(row.commission),
    swap: num(row.swap),
    note: row.note || undefined,
    tags: tagsOf(row.tagsJson),
  };
}

export function toJournalAccountDto(row: {
  id: number; tradeAccountId: number | null; tradeId: string; broker: string; accountType: string;
  platform: string; startingBalance: unknown; startDate: Date; createdAt: Date;
  mtServer: string | null; investorPasswordEnc: string | null; mtLastSyncAt: Date | null;
  _count?: { trades: number };
  trades?: Array<{ closeAt: Date | null }>;
}): JournalAccountDto {
  const num = (v: unknown) => (typeof v === "object" && v !== null && "toNumber" in v ? (v as { toNumber: () => number }).toNumber() : Number(v));
  const trades = row.trades ?? [];
  return {
    id: row.id,
    tradeAccountId: row.tradeAccountId ?? undefined,
    tradeId: row.tradeId,
    broker: row.broker,
    accountType: row.accountType,
    platform: row.platform,
    startingBalance: num(row.startingBalance),
    startDate: row.startDate.toISOString().slice(0, 10),
    createdDate: row.createdAt.toISOString().slice(0, 10),
    mtServer: row.mtServer || undefined,
    hasInvestorPassword: Boolean(row.investorPasswordEnc),
    mtLastSyncAt: row.mtLastSyncAt ? row.mtLastSyncAt.toISOString() : undefined,
    openTrades: trades.filter((t) => t.closeAt == null).length,
    tradeCount: row._count?.trades ?? trades.length,
  };
}

export function toRiskRuleDto(row: { maxDailyLoss: unknown; maxLoss: unknown; profitTarget: unknown } | null): RiskRuleDto {
  const num = (v: unknown, fallback: number) => {
    const n = typeof v === "object" && v !== null && "toNumber" in v ? (v as { toNumber: () => number }).toNumber() : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    maxDailyLoss: num(row?.maxDailyLoss, 250),
    maxLoss: num(row?.maxLoss, 500),
    profitTarget: num(row?.profitTarget, 400),
  };
}

// ── Trade body validation (manual form + import confirm) ─────────────────

function asDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function asDecimal(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Validates a hand-entered trade. `partial` allows PATCH-style subsets.
 *  Open trades omit close fields (closeAt/closePrice/pnl stay null). */
export type ParsedTrade = {
  symbol?: string; side?: "buy" | "sell";
  openAt?: Date | null; closeAt?: Date | null;
  openPrice?: number | null; closePrice?: number | null;
  tp?: number | null; sl?: number | null;
  lots?: number | null; pnl?: number | null;
  commission?: number | null; swap?: number | null;
  ticket?: string | null; note?: string | null; tagsJson?: string;
};

export function parseTradeBody(body: Record<string, unknown>, partial = false): ParsedTrade {
  const data: Record<string, unknown> = {};
  const need = (field: string) => {
    if (body[field] === undefined && !partial) throw new Error(`Missing ${field}`);
    return body[field] !== undefined;
  };

  if (need("symbol")) {
    const symbol = String(body.symbol || "").trim().toUpperCase().slice(0, 32);
    if (!symbol && !partial) throw new Error("Symbol is required");
    if (symbol || !partial) data.symbol = symbol;
  }
  if (body.side !== undefined) {
    const side = String(body.side).toLowerCase();
    if (side !== "buy" && side !== "sell") throw new Error("Side must be buy or sell");
    data.side = side;
  } else if (!partial) {
    throw new Error("Side is required");
  }
  if (need("openAt")) {
    const openAt = asDate(body.openAt);
    if (!openAt && !partial) throw new Error("Open time is invalid");
    if (openAt || !partial) data.openAt = openAt;
  }
  if (body.closeAt !== undefined) {
    data.closeAt = body.closeAt ? asDate(body.closeAt) : null;
    if (body.closeAt && !data.closeAt) throw new Error("Close time is invalid");
  }
  const decimalFields = ["openPrice", "closePrice", "tp", "sl", "lots", "pnl", "commission", "swap"] as const;
  const requiredFields = partial ? [] : ["openPrice", "lots"];
  for (const field of decimalFields) {
    if (body[field] === undefined) {
      if ((requiredFields as string[]).includes(field)) throw new Error(`Missing ${field}`);
      continue;
    }
    const raw = body[field];
    if (raw === null || raw === "") {
      if ((requiredFields as string[]).includes(field)) throw new Error(`Missing ${field}`);
      data[field] = null;
      continue;
    }
    const value = asDecimal(raw);
    if (value == null) throw new Error(`Invalid ${field}`);
    data[field] = value;
  }
  if (data.lots !== undefined && (Number(data.lots) <= 0 || !Number.isFinite(Number(data.lots)))) {
    throw new Error("Lots must be greater than 0");
  }
  if (body.ticket !== undefined) data.ticket = String(body.ticket).trim().slice(0, 64) || null;
  if (body.note !== undefined) data.note = String(body.note).trim() || null;
  if (body.tags !== undefined) {
    const tags = (Array.isArray(body.tags) ? body.tags : String(body.tags).split(","))
      .map((tag) => String(tag).trim()).filter(Boolean).slice(0, 10);
    data.tagsJson = JSON.stringify(tags);
  }
  if (data.closeAt && data.openAt && (data.closeAt as Date) < (data.openAt as Date)) {
    throw new Error("Close time is before open time");
  }
  return data as ParsedTrade;
}

const HEADER_SYNONYMS: Record<string, string[]> = {
  ticket: ["ticket", "order", "position", "position id", "deal", "#", "ticket no"],
  symbol: ["symbol", "instrument", "pair", "security"],
  side: ["type", "side", "direction", "deal type", "order type"],
  lots: ["volume", "lots", "lot", "size", "amount"],
  openAt: ["open time", "open", "time open", "open date", "open_datetime"],
  openPrice: ["open price", "price open", "open_price"],
  closeAt: ["close time", "close", "time close", "close date", "close_datetime"],
  closePrice: ["close price", "price close", "close_price"],
  pnl: ["profit", "p/l", "pnl", "net", "net profit", "profit/loss"],
  commission: ["commission", "comm"],
  swap: ["swap", "swaps", "rollover"],
};

function splitLine(line: string, delimiter: string): string[] {
  // Minimal CSV: handles quoted cells containing the delimiter.
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"|"$/g, "").trim());
}

function detectDelimiter(header: string): string {
  const candidates = ["\t", ";", ","];
  let best = ",";
  let bestCount = 0;
  for (const delimiter of candidates) {
    const count = header.split(delimiter).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = delimiter;
    }
  }
  return best;
}

function parseDateTime(raw: string): Date | null {
  const cleaned = raw.trim().replace(/^(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3");
  if (!cleaned) return null;
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseSide(raw: string): "buy" | "sell" | null {
  const lower = raw.trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes("sell")) return "sell";
  if (lower.includes("buy")) return "buy";
  if (lower === "in") return "buy";
  if (lower === "out") return "sell";
  return null;
}

/** Parses MT4/MT5-style history exports (or any CSV with matching headers).
 *  Returns valid rows plus per-line errors — never throws on bad content. */
export function parseStatementCsv(text: string): { rows: ImportPreviewRow[]; errors: string[] } {
  const rows: ImportPreviewRow[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { rows, errors: ["ไฟล์ว่างเปล่า"] };

  // The header is the first line that looks like column names, not data.
  let headerIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (/symbol|ticket|type|volume|profit/i.test(lines[i])) {
      headerIndex = i;
      break;
    }
  }
  const delimiter = detectDelimiter(lines[headerIndex]);
  const headers = splitLine(lines[headerIndex], delimiter).map((h) => h.toLowerCase());
  const colOf = (field: string): number =>
    headers.findIndex((h) => HEADER_SYNONYMS[field].some((name) => h === name || h.includes(name)));

  const col = {
    ticket: colOf("ticket"),
    symbol: colOf("symbol"),
    side: colOf("side"),
    lots: colOf("lots"),
    openAt: colOf("openAt"),
    openPrice: colOf("openPrice"),
    closeAt: colOf("closeAt"),
    closePrice: colOf("closePrice"),
    pnl: colOf("pnl"),
    commission: colOf("commission"),
    swap: colOf("swap"),
  };
  const missing = ["symbol", "side", "lots", "pnl"].filter((field) => col[field as keyof typeof col] < 0);
  if (col.symbol < 0 || col.side < 0) {
    return { rows, errors: ["ไม่พบคอลัมน์ Symbol/Type — ตรวจสอบรูปแบบไฟล์ (ต้องมีคอลัมน์ Symbol, Type/Side, Volume, Profit)"] };
  }
  if (missing.length) errors.push(`ไม่พบคอลัมน์: ${missing.join(", ")} — แถวที่ไม่สมบูรณ์จะถูกข้าม`);

  const cell = (cells: string[], index: number) => (index >= 0 && index < cells.length ? cells[index] : "");
  const num = (raw: string) => Number(String(raw).replace(/[, ]/g, ""));

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], delimiter);
    const ticket = cell(cells, col.ticket);
    // Skip balance/credit/summary rows (no side, or keywords instead of data).
    const side = parseSide(cell(cells, col.side));
    const symbol = cell(cells, col.symbol).toUpperCase();
    if (!side || !symbol || /balance|credit|deposit|withdraw|total|equity/i.test(`${ticket} ${symbol} ${cell(cells, col.side)}`)) continue;

    const lots = num(cell(cells, col.lots));
    const pnl = col.pnl >= 0 ? num(cell(cells, col.pnl)) : NaN;
    const openAt = col.openAt >= 0 ? parseDateTime(cell(cells, col.openAt)) : null;
    const closeAt = col.closeAt >= 0 ? parseDateTime(cell(cells, col.closeAt)) : null;
    const openPrice = col.openPrice >= 0 ? num(cell(cells, col.openPrice)) : NaN;
    const closePrice = col.closePrice >= 0 ? num(cell(cells, col.closePrice)) : NaN;

    const problems: string[] = [];
    if (!Number.isFinite(lots) || lots <= 0) problems.push("lots ไม่ถูกต้อง");
    if (!Number.isFinite(pnl)) problems.push("profit ไม่ถูกต้อง");
    if (col.openAt >= 0 && !openAt) problems.push("เวลาเปิดไม่ถูกต้อง");
    if (col.closeAt >= 0 && !closeAt) problems.push("เวลาปิดไม่ถูกต้อง");
    if (problems.length) {
      errors.push(`บรรทัดที่ ${i + 1}: ${problems.join(", ")}`);
      continue;
    }
    const fallbackDate = new Date().toISOString();
    rows.push({
      rowNumber: i + 1,
      ticket: ticket || `${symbol}-${i}`,
      symbol,
      side,
      openAt: (openAt ?? closeAt ?? new Date(fallbackDate)).toISOString(),
      closeAt: (closeAt ?? openAt ?? new Date(fallbackDate)).toISOString(),
      openPrice: Number.isFinite(openPrice) ? openPrice : 0,
      closePrice: Number.isFinite(closePrice) ? closePrice : 0,
      lots,
      pnl,
      commission: col.commission >= 0 && Number.isFinite(num(cell(cells, col.commission))) ? num(cell(cells, col.commission)) : 0,
      swap: col.swap >= 0 && Number.isFinite(num(cell(cells, col.swap))) ? num(cell(cells, col.swap)) : 0,
      tp: null,
      sl: null,
      duplicate: false,
    });
  }
  return { rows, errors };
}

/** Flags preview rows whose external key already exists for the account. */
export async function flagDuplicates(accountId: number, rows: ImportPreviewRow[]): Promise<ImportPreviewRow[]> {
  if (!rows.length) return rows;
  const keys = rows.map((row) => `${accountId}:${row.ticket}:${row.closeAt}`);
  const existing = await getPrisma().journalTrade.findMany({
    where: { externalKey: { in: keys } },
    select: { externalKey: true },
  });
  const seen = new Set(existing.map((row) => row.externalKey));
  return rows.map((row) => ({ ...row, duplicate: seen.has(`${accountId}:${row.ticket}:${row.closeAt}`) }));
}

// ── Rule-based insights ─────────────────────────────────────────────────

type ClosedTrade = { symbol: string; openAt: string; closeAt: string; pnl: number; lots: number; tags: string[]; sl: number | null; note?: string };

function sessionOf(dateIso: string): string {
  const hour = new Date(dateIso).getUTCHours();
  if (hour >= 0 && hour < 8) return "เอเชีย";
  if (hour >= 8 && hour < 13) return "ลอนดอน";
  if (hour >= 13 && hour < 21) return "นิวยอร์ก";
  return "นอกเวลา";
}

function winRate(rows: ClosedTrade[]): number {
  return rows.length ? (rows.filter((t) => t.pnl > 0).length / rows.length) * 100 : 0;
}

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;

/** Deterministic coaching notes from the member's own closed trades — no
 *  external AI involved. At least MIN_TRADES rows back every group insight;
 *  thin data yields a gentle nudge instead of a verdict. */
export function buildInsights(trades: ClosedTrade[], rules: { maxDailyLoss: number; maxLoss: number; profitTarget: number }): InsightDto[] {
  const insights: InsightDto[] = [];
  const closed = trades.filter((t) => t.closeAt);
  if (closed.length < 3) {
    insights.push({
      key: "thin-data",
      title: "เริ่มสะสมข้อมูล",
      detail: `บันทึกอีก ${3 - closed.length} เทรด ระบบจะเริ่มสรุปจุดแข็ง/จุดอ่อนให้`,
      tone: "neutral",
    });
    return insights;
  }

  // Best / worst symbol (min 3 trades each).
  const bySymbol = new Map<string, ClosedTrade[]>();
  for (const trade of closed) bySymbol.set(trade.symbol, [...(bySymbol.get(trade.symbol) ?? []), trade]);
  const symbols = [...bySymbol.entries()].filter(([, rows]) => rows.length >= 3);
  if (symbols.length) {
    const ranked = symbols
      .map(([symbol, rows]) => ({ symbol, wr: winRate(rows), pnl: rows.reduce((s, t) => s + t.pnl, 0), n: rows.length }))
      .sort((a, b) => b.pnl - a.pnl);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    insights.push({
      key: "best-symbol",
      title: `จุดแข็ง: ${best.symbol}`,
      detail: `${best.n} เทรด · winrate ${best.wr.toFixed(0)}% · ${money(best.pnl)}`,
      tone: "good",
      value: best.symbol,
    });
    if (ranked.length > 1 && worst.pnl < 0) {
      insights.push({
        key: "worst-symbol",
        title: `ระวัง: ${worst.symbol}`,
        detail: `${worst.n} เทรด · winrate ${worst.wr.toFixed(0)}% · ${money(worst.pnl)} — ลองลดไซส์หรือพักก่อน`,
        tone: "bad",
        value: worst.symbol,
      });
    }
  }

  // Best session bucket (min 5 trades).
  const bySession = new Map<string, ClosedTrade[]>();
  for (const trade of closed) {
    const session = sessionOf(trade.openAt);
    bySession.set(session, [...(bySession.get(session) ?? []), trade]);
  }
  const sessions = [...bySession.entries()].filter(([, rows]) => rows.length >= 5);
  if (sessions.length) {
    const ranked = sessions
      .map(([session, rows]) => ({ session, wr: winRate(rows), pnl: rows.reduce((s, t) => s + t.pnl, 0), n: rows.length }))
      .sort((a, b) => b.pnl - a.pnl);
    const best = ranked[0];
    insights.push({
      key: "best-session",
      title: `ช่วงเวลาถนัด: ${best.session}`,
      detail: `${best.n} เทรด · winrate ${best.wr.toFixed(0)}% · ${money(best.pnl)}`,
      tone: "good",
      value: best.session,
    });
  }

  // Overtrading days (8+ closed trades in a day).
  const byDay = new Map<string, ClosedTrade[]>();
  for (const trade of closed) {
    const day = trade.closeAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), trade]);
  }
  const busy = [...byDay.entries()].filter(([, rows]) => rows.length >= 8);
  if (busy.length) {
    const worst = busy
      .map(([day, rows]) => ({ day, n: rows.length, pnl: rows.reduce((s, t) => s + t.pnl, 0) }))
      .sort((a, b) => a.pnl - b.pnl)[0];
    insights.push({
      key: "overtrade",
      title: `เทรดถี่ ${busy.length} วัน (≥8 เทรด/วัน)`,
      detail: `วันที่หนักสุด ${worst.day}: ${worst.n} เทรด ${money(worst.pnl)} — วันถี่มักจบแดง`,
      tone: "bad",
    });
  }

  // Current streak by close order.
  const ordered = [...closed].sort((a, b) => a.closeAt.localeCompare(b.closeAt));
  let streak = 0;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const win = ordered[i].pnl > 0;
    if (i === ordered.length - 1) streak = win ? 1 : -1;
    else if ((streak > 0) === win) streak += win ? 1 : -1;
    else break;
  }
  if (Math.abs(streak) >= 3) {
    insights.push({
      key: "streak",
      title: streak > 0 ? `ชนะติด ${streak} เทรด` : `แพ้ติด ${Math.abs(streak)} เทรด`,
      detail: streak > 0 ? "รักษาวินัยเดิม อย่าเพิ่มไซส์เพราะมั่นใจ" : "พักก่อน ทบทวนแล้วค่อยกลับมาด้วยไซส์เล็ก",
      tone: streak > 0 ? "good" : "bad",
    });
  }

  // Risk usage vs the member's own objectives.
  const dayPnl = new Map<string, number>();
  for (const trade of closed) {
    const day = trade.closeAt.slice(0, 10);
    dayPnl.set(day, (dayPnl.get(day) ?? 0) + trade.pnl);
  }
  const worstDay = Math.min(0, ...dayPnl.values());
  if (Math.abs(worstDay) > rules.maxDailyLoss) {
    insights.push({
      key: "daily-breach",
      title: "หลุดกฎขาดทุนรายวัน",
      detail: `วันที่แย่สุด ${money(worstDay)} เกินลิมิต ${money(-rules.maxDailyLoss)} — ตั้ง stop รายวันแล้วหยุดจริง`,
      tone: "bad",
    });
  }
  const total = closed.reduce((s, t) => s + t.pnl, 0);
  const noSL = closed.filter((t) => t.sl == null).length;
  if (closed.length >= 5 && noSL / closed.length > 0.5) {
    insights.push({
      key: "no-sl",
      title: `เกินครึ่งไม่ตั้ง SL (${Math.round((noSL / closed.length) * 100)}%)`,
      detail: "เทรดไม่มี SL คือความเสี่ยงเปิด — ใส่ทุกครั้งก่อนกดส่งออเดอร์",
      tone: "bad",
    });
  }
  const noNote = closed.filter((t) => !t.note).length;
  if (closed.length >= 5 && noNote / closed.length > 0.7) {
    insights.push({
      key: "no-notes",
      title: "ยังไม่จดบันทึก",
      detail: "โน้ตสั้นๆ ต่อเทรดทำให้ย้อนดูความผิดพลาดได้ — เริ่มจากเทรดที่แพ้ก่อน",
      tone: "neutral",
    });
  }
  if (total >= rules.profitTarget && rules.profitTarget > 0) {
    insights.push({
      key: "target-hit",
      title: "ถึงเป้ากำไรแล้ว",
      detail: `${money(total)} / ${money(rules.profitTarget)} — พิจารณาหยุดตามแผน อย่าคืนกำไรให้ตลาด`,
      tone: "good",
    });
  }

  return insights.slice(0, 8);
}
