import { getPrisma } from "./prisma";

/* Symbols (currency pairs / instruments) each member has actually traded.
   Real sources only:
   - JournalTrade rows synced from the member's MetaTrader account;
   - TradeLog rows that carry a real symbol. Today the lot API only returns a
     per-account total (stored as symbol "ALL"), which is skipped — if the API
     starts sending per-symbol rows, they show up here automatically.
   A member with no such data simply has no symbols (the UI shows "—"). */

export type SymbolStat = { symbol: string; trades: number; lots: number };

const AGGREGATE_SYMBOL = "ALL";

export async function symbolsByMember(memberIds: number[]): Promise<Map<number, SymbolStat[]>> {
  const result = new Map<number, SymbolStat[]>();
  if (!memberIds.length) return result;
  const prisma = getPrisma();

  const [accounts, logGroups] = await Promise.all([
    prisma.journalAccount.findMany({ where: { memberId: { in: memberIds } }, select: { id: true, memberId: true } }),
    prisma.tradeLog.groupBy({
      by: ["memberId", "symbol"],
      where: { memberId: { in: memberIds }, symbol: { not: AGGREGATE_SYMBOL } },
      _count: true,
      _sum: { lots: true },
    }),
  ]);
  const memberOfAccount = new Map(accounts.map((a) => [a.id, a.memberId]));
  const journalGroups = accounts.length
    ? await prisma.journalTrade.groupBy({
        by: ["accountId", "symbol"],
        where: { accountId: { in: accounts.map((a) => a.id) } },
        _count: true,
        _sum: { lots: true },
      })
    : [];

  const merged = new Map<number, Map<string, SymbolStat>>();
  const add = (memberId: number, rawSymbol: string, trades: number, lots: number) => {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!symbol) return;
    const perMember = merged.get(memberId) ?? new Map<string, SymbolStat>();
    const stat = perMember.get(symbol) ?? { symbol, trades: 0, lots: 0 };
    stat.trades += trades;
    stat.lots = Math.round((stat.lots + lots) * 100) / 100;
    perMember.set(symbol, stat);
    merged.set(memberId, perMember);
  };
  for (const g of journalGroups) {
    const memberId = memberOfAccount.get(g.accountId);
    if (memberId != null) add(memberId, g.symbol, g._count, g._sum.lots?.toNumber() ?? 0);
  }
  for (const g of logGroups) add(g.memberId, g.symbol, g._count, g._sum.lots?.toNumber() ?? 0);

  for (const [memberId, perMember] of merged) {
    result.set(memberId, [...perMember.values()].sort((a, b) => b.lots - a.lots || b.trades - a.trades));
  }
  return result;
}
