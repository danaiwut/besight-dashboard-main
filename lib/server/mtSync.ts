import { timingSafeEqual } from "node:crypto";
import { getPrisma } from "./prisma";
import { decryptSecret } from "./secrets";

/* ── MT sync webhook (called by the BeSight Journal EA, not by browsers) ──
    Auth = the account's own investor (read-only) password, verified against
    the encrypted copy with a timing-safe compare. No session involved. */

export type MtSyncTrade = {
  ticket?: string;
  symbol?: string;
  type?: string;
  volume?: number;
  openTime?: number;
  openPrice?: number;
  closeTime?: number;
  closePrice?: number;
  profit?: number;
  commission?: number;
  swap?: number;
};

function sameSecret(provided: string, encrypted: string): boolean {
  let decrypted: string;
  try {
    decrypted = decryptSecret(encrypted);
  } catch {
    return false;
  }
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(decrypted, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function toSide(type: unknown): "buy" | "sell" | null {
  const lower = String(type ?? "").trim().toLowerCase();
  if (lower.startsWith("sell")) return "sell";
  if (lower.startsWith("buy")) return "buy";
  return null;
}

function toDate(value: unknown): Date | null {
  const ms = typeof value === "number" ? value * 1000 : Date.parse(String(value ?? ""));
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function toNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Verifies the investor password and upserts the closed trades. Returns per
 *  account what landed. Throws with a `status` carrying the HTTP code. */
export async function syncMtTrades(input: {
  login: string;
  server?: string;
  investorPassword: string;
  trades: MtSyncTrade[];
}): Promise<{ imported: number; skipped: number; accounts: number }> {
  const login = String(input.login || "").trim();
  if (!login) throw Object.assign(new Error("login is required"), { status: 400 });
  if (!String(input.investorPassword || "")) throw Object.assign(new Error("investor password is required"), { status: 401 });
  if (!Array.isArray(input.trades) || input.trades.length > 500) {
    throw Object.assign(new Error("trades must be an array (max 500)"), { status: 400 });
  }

  const prisma = getPrisma();
  const journals = await prisma.journalAccount.findMany({
    where: { tradeId: login },
    select: { id: true, memberId: true, mtServer: true, investorPasswordEnc: true },
  });
  if (!journals.length) throw Object.assign(new Error("No journal account for this login"), { status: 404 });

  // The server name pins the credential to one MT server when the member set
  // one; journals without it accept any server for that login.
  const server = String(input.server || "").trim();
  const candidates = journals.filter((journal) => {
    if (!journal.investorPasswordEnc) return false;
    if (journal.mtServer && server && journal.mtServer.toLowerCase() !== server.toLowerCase()) return false;
    return sameSecret(String(input.investorPassword), journal.investorPasswordEnc);
  });
  if (!candidates.length) throw Object.assign(new Error("Invalid investor password"), { status: 401 });

  let imported = 0;
  let skipped = 0;
  const now = new Date();
  for (const journal of candidates) {
    const rows: Array<{
      accountId: number; externalKey: string; ticket: string | null; symbol: string; side: string;
      openAt: Date; closeAt: Date; openPrice: number; closePrice: number | null;
      lots: number; pnl: number | null; commission: number; swap: number;
    }> = [];
    for (const raw of input.trades) {
      const side = toSide(raw.type);
      const symbol = String(raw.symbol || "").trim().toUpperCase().slice(0, 32);
      const openAt = toDate(raw.openTime);
      const closeAt = toDate(raw.closeTime);
      const lots = toNum(raw.volume);
      if (!side || !symbol || !openAt || !closeAt || lots == null || lots <= 0) {
        skipped += 1;
        continue;
      }
      const ticket = String(raw.ticket || "").trim().slice(0, 64) || `${symbol}-${closeAt.getTime()}`;
      rows.push({
        accountId: journal.id,
        externalKey: `${journal.id}:${ticket}:${closeAt.toISOString()}`,
        ticket,
        symbol,
        side,
        openAt,
        closeAt,
        openPrice: toNum(raw.openPrice) ?? 0,
        closePrice: toNum(raw.closePrice),
        lots,
        pnl: toNum(raw.profit),
        commission: toNum(raw.commission) ?? 0,
        swap: toNum(raw.swap) ?? 0,
      });
    }
    if (rows.length) {
      const created = await prisma.journalTrade.createMany({ data: rows, skipDuplicates: true });
      imported += created.count;
      skipped += rows.length - created.count;
    }
    await prisma.journalAccount.update({ where: { id: journal.id }, data: { mtLastSyncAt: now } });
  }
  return { imported, skipped, accounts: candidates.length };
}
