const LOT_PATHS = {
  account: "check-lot",
  campaign: "check-lot-campaign",
  country: "check-lot-country",
  excludedSymbol: "check-lot-symbol-not-in-list",
} as const;

export type LotAccountRow = { campaignName: string; loginId: string; lots: number };
export type LotCampaignRow = { campaignName: string; lots: number };
export type LotCountryRow = { country: string; lots: number };
export type LotExcludedSymbolRow = { campaignName: string; loginId: string; instrument: string; lots: number };

type RawRow = Record<string, unknown>;

function text(value: unknown) {
  return value == null ? "" : String(value);
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function lotWindowForExpiry(expiresAt: Date) {
  const dateFrom = addMonths(expiresAt, -1).toISOString().slice(0, 10);
  const dateTo = expiresAt.toISOString().slice(0, 10);
  return { dateFrom, dateTo, period: `${dateFrom}_${dateTo}` };
}

function assertDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${field} must be a valid YYYY-MM-DD date`);
  }
}

async function requestRows(path: string, dateFrom: string, dateTo: string, tradeId?: string): Promise<RawRow[]> {
  assertDate(dateFrom, "date_from");
  assertDate(dateTo, "date_to");
  if (dateFrom > dateTo) throw new Error("date_from must be before or equal to date_to");

  const base = process.env.LOT_CHECK_BASE_URL || "https://ai.besight.net/webhook";
  const url = new URL(`${base.replace(/\/$/, "")}/${path}`);
  url.searchParams.set("date_from", dateFrom);
  url.searchParams.set("date_to", dateTo);
  if (tradeId) url.searchParams.set("tradeid", tradeId);

  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const body = await response.text();
  if (!response.ok) throw new Error(`Lot service returned ${response.status}: ${body.slice(0, 240)}`);
  const parsed: unknown = JSON.parse(body);
  if (!Array.isArray(parsed)) throw new Error("Lot service returned an unexpected response");
  return parsed.filter((row): row is RawRow => Boolean(row) && typeof row === "object");
}

export async function fetchLotChecks(dateFrom: string, dateTo: string, tradeId?: string) {
  const [accountRaw, campaignRaw, countryRaw, symbolRaw] = await Promise.all([
    tradeId ? requestRows(LOT_PATHS.account, dateFrom, dateTo, tradeId) : Promise.resolve([]),
    requestRows(LOT_PATHS.campaign, dateFrom, dateTo),
    requestRows(LOT_PATHS.country, dateFrom, dateTo),
    requestRows(LOT_PATHS.excludedSymbol, dateFrom, dateTo),
  ]);

  const account: LotAccountRow[] = accountRaw.map((row) => ({
    campaignName: text(row.campaignName), loginId: text(row.loginId), lots: number(row.lots),
  }));
  const campaigns: LotCampaignRow[] = campaignRaw.map((row) => ({ campaignName: text(row.campaignName), lots: number(row.lots) }));
  const countries: LotCountryRow[] = countryRaw.map((row) => ({ country: text(row.country), lots: number(row.lots) }));
  const excludedSymbols: LotExcludedSymbolRow[] = symbolRaw.map((row) => ({
    campaignName: text(row.campaignName), loginId: text(row.loginId), instrument: text(row.instrument), lots: number(row.lots),
  }));

  return {
    account,
    campaigns,
    countries,
    excludedSymbols,
    totalLots: account.reduce((sum, row) => sum + row.lots, 0),
  };
}

export async function fetchAccountLotCheck(dateFrom: string, dateTo: string, tradeId: string) {
  const rows = await requestRows(LOT_PATHS.account, dateFrom, dateTo, tradeId);
  const account: LotAccountRow[] = rows.map((row) => ({
    campaignName: text(row.campaignName), loginId: text(row.loginId), lots: number(row.lots),
  }));
  return { account, campaigns: [], countries: [], excludedSymbols: [], totalLots: account.reduce((sum, row) => sum + row.lots, 0) };
}
