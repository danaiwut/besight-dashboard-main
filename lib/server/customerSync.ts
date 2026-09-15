import { Plan, RecordStatus, VerificationStatus } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "./prisma";

type RawObject = Record<string, unknown>;

export type CustomerMemberDto = {
  id: number;
  code: string;
  name: string;
  displayName?: string;
  avatarUrl?: string;
  email: string;
  phone: string;
  country?: string;
  address?: string;
  tv: string;
  telegramUsername?: string;
  telegramUserId?: string;
  discordUsername?: string;
  createdDate: string;
  joinedDate: string;
  channels?: Array<"facebook" | "instagram" | "tiktok">;
  primaryTradeAccountId?: number;
  plan: "free" | "ib_partner";
  requiredLotsOverride?: number;
  requiredLotsOverrideNote?: string;
};

export type CustomerTradeAccountDto = {
  id: number;
  memberId: number;
  brokerId: number;
  tradeId: string;
  accountType: string;
  partnerIb: string;
  verification: "verified" | "pending" | "not_found";
  createdDate: string;
  lastSync: string;
  status: "active" | "inactive";
};

type NormalizedCustomer = {
  externalId?: string;
  member: Omit<CustomerMemberDto, "id" | "primaryTradeAccountId">;
  accounts: Array<Omit<CustomerTradeAccountDto, "id" | "memberId" | "brokerId"> & { brokerCode: string; brokerName: string }>;
};

function object(value: unknown): RawObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RawObject : undefined;
}

function first(row: RawObject, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function stringValue(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function dateValue(value: unknown) {
  const raw = stringValue(value);
  const parsed = raw ? new Date(raw) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function numericId(seed: string, index: number) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return (hash % 2_000_000_000) || index + 1;
}

function channels(value: unknown): Array<"facebook" | "instagram" | "tiktok"> {
  const values = Array.isArray(value) ? value : stringValue(value).split(/[;,|]/);
  return values
    .map((item) => stringValue(item).toLowerCase())
    .filter((item): item is "facebook" | "instagram" | "tiktok" => ["facebook", "instagram", "tiktok"].includes(item));
}

function accountRows(row: RawObject): RawObject[] {
  const nested = first(row, ["trade_accounts", "tradeAccounts", "accounts", "trading_accounts"]);
  if (Array.isArray(nested)) return nested.map(object).filter((value): value is RawObject => Boolean(value));
  const directTradeId = first(row, ["trade_id", "tradeId", "tradeid", "loginId", "login_id", "mt4id", "mt5id"]);
  return directTradeId ? [row] : [];
}

function normalizeCustomer(row: RawObject, index: number): NormalizedCustomer {
  const externalId = stringValue(first(row, ["external_id", "customer_id", "member_id", "id"])) || undefined;
  const email = stringValue(first(row, ["email", "email_address"]));
  const name = stringValue(first(row, ["name", "full_name", "fullname", "customer_name", "display_name"])) ||
    [first(row, ["first_name", "firstname"]), first(row, ["last_name", "lastname"])].map(stringValue).filter(Boolean).join(" ") ||
    email || `Member ${index + 1}`;
  const code = stringValue(first(row, ["code", "member_code", "customer_code"])) ||
    `BS-${String(numericId(externalId || email || name, index)).slice(-6).padStart(6, "0")}`;
  const createdDate = dateValue(first(row, ["created_at", "createdDate", "created_date"]));
  const planRaw = stringValue(first(row, ["plan", "membership_plan", "member_type"])).toLowerCase();
  const normalizedAccounts = accountRows(row).map((account) => {
    const verification = stringValue(first(account, ["verification", "verification_status", "status"])).toLowerCase();
    const status = stringValue(first(account, ["account_status", "status"])).toLowerCase();
    return {
      tradeId: stringValue(first(account, ["trade_id", "tradeId", "tradeid", "loginId", "login_id", "mt4id", "mt5id"])),
      accountType: stringValue(first(account, ["account_type", "accountType", "type"])) || "Standard",
      partnerIb: stringValue(first(account, ["partner_ib", "partnerIb", "ib"])),
      verification: verification === "not_found" ? "not_found" as const : verification === "pending" ? "pending" as const : "verified" as const,
      createdDate: dateValue(first(account, ["created_at", "createdDate", "created_date"]) || createdDate),
      lastSync: dateValue(first(account, ["last_sync", "lastSync", "updated_at"])),
      status: status === "inactive" ? "inactive" as const : "active" as const,
      brokerCode: stringValue(first(account, ["broker_code", "brokerCode"])).toUpperCase(),
      brokerName: stringValue(first(account, ["broker_name", "brokerName"])),
    };
  }).filter((account) => account.tradeId);

  const override = Number(first(row, ["required_lots_override", "requiredLotsOverride"]));
  return {
    externalId,
    member: {
      code,
      name,
      displayName: stringValue(first(row, ["display_name", "displayName"])) || undefined,
      avatarUrl: stringValue(first(row, ["avatar_url", "avatarUrl", "avatar"])) || undefined,
      email,
      phone: stringValue(first(row, ["phone", "phone_number", "mobile"])),
      country: stringValue(first(row, ["country", "country_name"])) || undefined,
      address: stringValue(first(row, ["address", "full_address"])) || undefined,
      tv: stringValue(first(row, ["tradingview", "trading_view", "tradingView", "tv", "tv_username", "username"])),
      telegramUsername: stringValue(first(row, ["telegram_username", "telegramUsername", "telegram"])) || undefined,
      telegramUserId: stringValue(first(row, ["telegram_user_id", "telegramUserId"])) || undefined,
      discordUsername: stringValue(first(row, ["discord_username", "discordUsername", "discord"])) || undefined,
      createdDate,
      joinedDate: dateValue(first(row, ["joined_at", "joinedDate", "joined_date", "created_at"])),
      channels: channels(first(row, ["channels", "acquisition_channels", "source"])),
      plan: planRaw.includes("ib") || planRaw.includes("partner") ? "ib_partner" : "free",
      requiredLotsOverride: Number.isFinite(override) && override >= 0 ? override : undefined,
      requiredLotsOverrideNote: stringValue(first(row, ["required_lots_override_note", "requiredLotsOverrideNote"])) || undefined,
    },
    accounts: normalizedAccounts,
  };
}

function extractRows(payload: unknown): RawObject[] {
  if (Array.isArray(payload)) return payload.map(object).filter((value): value is RawObject => Boolean(value));
  const root = object(payload);
  if (!root) return [];
  for (const key of ["data", "customers", "members", "result"]) {
    if (Array.isArray(root[key])) return (root[key] as unknown[]).map(object).filter((value): value is RawObject => Boolean(value));
  }
  return [];
}

async function fetchCustomers() {
  const baseUrl = process.env.CRM_CUSTOMERS_URL || "https://nmetbatfjiagpjbbmowp.supabase.co/functions/v1/crm-customers/tradingview";
  const token = process.env.CRM_CUSTOMERS_TOKEN || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token) throw new Error("CRM_CUSTOMERS_TOKEN is not configured");

  const rows: RawObject[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 100; page++) {
    const url = new URL(baseUrl);
    url.searchParams.set("limit", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, apikey: token, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`CRM customers returned ${response.status}: ${body.slice(0, 240)}`);
    const parsed: unknown = JSON.parse(body);
    rows.push(...extractRows(parsed));
    const pagination = object(parsed);
    if (!pagination?.has_more || !pagination.next_cursor) break;
    cursor = stringValue(pagination.next_cursor) || null;
    if (!cursor) break;
  }
  return rows.map(normalizeCustomer);
}

async function saveCustomers(customers: NormalizedCustomer[]) {
  const prisma = getPrisma();
  for (const customer of customers) {
    const existing = await prisma.member.findFirst({
      where: {
        OR: [
          ...(customer.externalId ? [{ externalId: customer.externalId }] : []),
          { code: customer.member.code },
          ...(customer.member.email ? [{ email: customer.member.email }] : []),
        ],
      },
      select: { id: true },
    });
    const data = {
      externalId: customer.externalId,
      code: customer.member.code,
      name: customer.member.name,
      displayName: customer.member.displayName,
      avatarUrl: customer.member.avatarUrl,
      email: customer.member.email || null,
      phone: customer.member.phone || null,
      country: customer.member.country,
      address: customer.member.address,
      tradingView: customer.member.tv || null,
      telegramUsername: customer.member.telegramUsername,
      telegramUserId: customer.member.telegramUserId,
      discordUsername: customer.member.discordUsername,
      joinedAt: new Date(`${customer.member.joinedDate}T00:00:00Z`),
      plan: customer.member.plan === "ib_partner" ? Plan.ib_partner : Plan.free,
      requiredLotsOverride: customer.member.requiredLotsOverride,
      requiredLotsOverrideNote: customer.member.requiredLotsOverrideNote,
    };
    const member = existing
      ? await prisma.member.update({ where: { id: existing.id }, data })
      : await prisma.member.create({ data });

    await prisma.memberAcquisitionChannel.deleteMany({ where: { memberId: member.id } });
    if (customer.member.channels?.length) {
      await prisma.memberAcquisitionChannel.createMany({ data: customer.member.channels.map((channel) => ({ memberId: member.id, channel })) });
    }

    for (const account of customer.accounts) {
      const broker = account.brokerCode
        ? await prisma.broker.upsert({
            where: { code: account.brokerCode },
            update: { name: account.brokerName || account.brokerCode, status: RecordStatus.active },
            create: { code: account.brokerCode, name: account.brokerName || account.brokerCode, status: RecordStatus.active, importMethod: "API" },
          })
        : null;
      const existingAccount = await prisma.tradeAccount.findFirst({ where: { memberId: member.id, tradeId: account.tradeId }, select: { id: true } });
      const accountData = {
        brokerId: broker?.id ?? null,
        accountType: account.accountType,
        partnerIb: account.partnerIb,
        verification: account.verification as VerificationStatus,
        status: account.status as RecordStatus,
        lastSyncAt: new Date(),
      };
      if (existingAccount) {
        await prisma.tradeAccount.update({ where: { id: existingAccount.id }, data: accountData });
      } else {
        await prisma.tradeAccount.create({
          data: {
            ...accountData,
            memberId: member.id,
            tradeId: account.tradeId,
            createdAt: new Date(`${account.createdDate}T00:00:00Z`),
          },
        });
      }
    }
  }
}

async function readDatabaseDtos() {
  const prisma = getPrisma();
  const records = await prisma.member.findMany({
    include: { acquisitionChannels: true, tradeAccounts: true },
    orderBy: { joinedAt: "desc" },
  });
  const members: CustomerMemberDto[] = records.map((member) => ({
    id: member.id,
    code: member.code,
    name: member.name,
    displayName: member.displayName || undefined,
    avatarUrl: member.avatarUrl || undefined,
    email: member.email || "",
    phone: member.phone || "",
    country: member.country || undefined,
    address: member.address || undefined,
    tv: member.tradingView || "",
    telegramUsername: member.telegramUsername || undefined,
    telegramUserId: member.telegramUserId || undefined,
    discordUsername: member.discordUsername || undefined,
    createdDate: member.createdAt.toISOString().slice(0, 10),
    joinedDate: member.joinedAt.toISOString().slice(0, 10),
    channels: member.acquisitionChannels.map((item) => item.channel).filter((item): item is "facebook" | "instagram" | "tiktok" => ["facebook", "instagram", "tiktok"].includes(item)),
    primaryTradeAccountId: member.primaryTradeAccountId || undefined,
    plan: member.plan,
    requiredLotsOverride: member.requiredLotsOverride?.toNumber(),
    requiredLotsOverrideNote: member.requiredLotsOverrideNote || undefined,
  }));
  const tradeAccounts: CustomerTradeAccountDto[] = records.flatMap((member) => member.tradeAccounts.map((account) => ({
    id: account.id,
    memberId: member.id,
    brokerId: account.brokerId ?? 0,
    tradeId: account.tradeId,
    accountType: account.accountType || "Standard",
    partnerIb: account.partnerIb || "",
    verification: account.verification,
    createdDate: account.createdAt.toISOString().slice(0, 10),
    lastSync: (account.lastSyncAt || account.updatedAt).toISOString().slice(0, 10),
    status: account.status,
  })));
  return { members, tradeAccounts };
}

export async function syncCustomerMembers() {
  const customers = await fetchCustomers();
  if (isDatabaseConfigured()) {
    await saveCustomers(customers);
    return { ...(await readDatabaseDtos()), saved: customers.length, database: true };
  }

  let accountId = 1;
  const members: CustomerMemberDto[] = customers.map((customer, index) => ({
    id: numericId(customer.externalId || customer.member.code, index),
    ...customer.member,
  }));
  const tradeAccounts: CustomerTradeAccountDto[] = customers.flatMap((customer, index) => {
    const memberId = members[index].id;
    return customer.accounts.map((account) => ({ ...account, id: accountId++, memberId, brokerId: 0 }));
  });
  return { members, tradeAccounts, saved: 0, database: false };
}
