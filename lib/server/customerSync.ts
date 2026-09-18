import { AccessSource, IndicatorAccessStatus, Plan, RecordStatus, TelegramStatus, VerificationStatus } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "./prisma";
import { bumpDataVersion } from "./dataVersion";
import { toMemberDto, toTradeAccountDto } from "./crmDtos";
import { snapshotOneMemberLots } from "./memberLotsSync";

/** Default private room for Telegram rows derived from member contact info —
 *  the sync payload carries no room, so derived rows share one room until an
 *  admin manages them explicitly. */
export const DEFAULT_TELEGRAM_ROOM = "BeSight VIP Signals";

/* Derive one TelegramAccess row from the member's own telegram contact info.
   A manual "banned" is never overwritten; otherwise status follows indicator
   standing so the Telegram page's indicator sync stays truthful. Shared by
   the customer replace-sync and the member create/update routes. */
export async function upsertTelegramFromMember(
  memberId: number,
  username: string | null | undefined,
  userId: string | null | undefined,
  hasActiveIndicator: boolean,
) {
  const tgUsername = username || undefined;
  const tgUserId = userId || undefined;
  if (!tgUsername && !tgUserId) return null;
  const prisma = getPrisma();
  const existingTg = await prisma.telegramAccess.findFirst({ where: { memberId }, orderBy: { id: "asc" } });
  const room = existingTg?.room || DEFAULT_TELEGRAM_ROOM;
  const status = existingTg?.status === TelegramStatus.banned
    ? TelegramStatus.banned
    : hasActiveIndicator ? TelegramStatus.active : TelegramStatus.pending;
  return prisma.telegramAccess.upsert({
    where: { memberId_room: { memberId, room } },
    update: {
      username: tgUsername ?? existingTg?.username,
      userId: tgUserId ?? existingTg?.userId,
      status,
    },
    create: {
      memberId,
      username: tgUsername,
      userId: tgUserId,
      room,
      status,
      grantedAt: new Date(),
    },
  });
}

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
  crmStartDate?: string;
  crmExpiryDate?: string;
  createdDate: string;
  joinedDate: string;
  channels?: Array<"facebook" | "instagram" | "tiktok">;
  primaryTradeAccountId?: number;
  plan: "free" | "ib_partner";
  requiredLotsOverride?: number;
  requiredLotsOverrideNote?: string;
  currentPeriodLots?: number;
  currentPeriodLotsAt?: string;
  /** Window the snapshot above was computed for (YYYY-MM-DD) — display
   *  layers only trust it when it matches the member's current window. */
  currentPeriodLotsFrom?: string;
  currentPeriodLotsTo?: string;
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
  /** True when another account row (any member) carries the same Trade ID —
   *  upstream data can duplicate one account across members. */
  duplicateTradeId?: boolean;
};

type NormalizedCustomer = {
  externalId?: string;
  member: Omit<CustomerMemberDto, "id" | "primaryTradeAccountId">;
  accounts: Array<Omit<CustomerTradeAccountDto, "id" | "memberId" | "brokerId"> & {
    brokerCode: string;
    brokerName: string;
    indicatorName?: string;
    indicatorPubId?: string;
    indicatorGrantedAt?: Date;
    indicatorExpiresAt?: Date;
    indicatorActive?: boolean;
  }>;
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

function optionalDateValue(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function optionalDateStringValue(value: unknown) {
  return optionalDateValue(value)?.toISOString().slice(0, 10);
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
    const rawBrokerCode = stringValue(first(account, ["broker_code", "brokerCode", "broker"])).toUpperCase();
    const brokerCode = rawBrokerCode === "XM" || rawBrokerCode === "EXNESS" ? rawBrokerCode : "";
    const indicatorName = stringValue(first(account, ["indicator_name", "indicatorName"])) || undefined;
    const indicatorStatus = stringValue(first(account, ["status"])).toLowerCase();
    return {
      tradeId: stringValue(first(account, ["trade_id", "tradeId", "tradeid", "loginId", "login_id", "mt4id", "mt5id"])),
      accountType: stringValue(first(account, ["account_type", "accountType", "type"])) || "Standard",
      partnerIb: stringValue(first(account, ["partner_ib", "partnerIb", "ib"])),
      verification: verification === "not_found" ? "not_found" as const : verification === "pending" ? "pending" as const : "verified" as const,
      createdDate: dateValue(first(account, ["created_at", "createdDate", "created_date"]) || createdDate),
      lastSync: dateValue(first(account, ["last_sync", "lastSync", "updated_at"])),
      status: status === "inactive" ? "inactive" as const : "active" as const,
      brokerCode,
      brokerName: brokerCode ? (stringValue(first(account, ["broker_name", "brokerName"])) || brokerCode) : "",
      indicatorName,
      indicatorPubId: stringValue(first(account, ["pine_id", "publicationId"])) || undefined,
      indicatorGrantedAt: optionalDateValue(first(account, ["granted_at", "grantedAt", "tv_granted_at", "tvGrantedAt"])),
      indicatorExpiresAt: optionalDateValue(first(account, ["expiration", "expires_at", "expiry", "tv_expiration", "tvExpiration"])),
      indicatorActive: indicatorName ? indicatorStatus !== "expired" && indicatorStatus !== "revoked" && indicatorStatus !== "suspended" : undefined,
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
      crmStartDate: optionalDateStringValue(first(row, ["granted_at", "grantedAt", "tv_granted_at", "tvGrantedAt"])),
      crmExpiryDate: optionalDateStringValue(first(row, ["expiration", "expires_at", "expiry", "tv_expiration", "tvExpiration"])),
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
  const savedMemberIds = new Set<number>();
  const tradeIdsByMember = new Map<number, Set<string>>();
  const indicatorIdByName = new Map<string, number>();
  /** Members whose qualification window is new/changed — their persisted lots
   *  belong to another window and must be recomputed before anyone reads them. */
  const recomputeIds: number[] = [];

  async function resolveIndicatorId(name: string, pubId?: string) {
    const cached = indicatorIdByName.get(name);
    if (cached) return cached;
    const indicator = await prisma.indicator.upsert({
      where: { name },
      update: pubId ? { publicationId: pubId } : {},
      create: { name, publicationId: pubId, status: RecordStatus.active },
    });
    indicatorIdByName.set(name, indicator.id);
    return indicator.id;
  }
  for (const customer of customers) {
    const existing = await prisma.member.findFirst({
      where: {
        OR: [
          ...(customer.externalId ? [{ externalId: customer.externalId }] : []),
          { code: customer.member.code },
          ...(customer.member.email ? [{ email: customer.member.email }] : []),
        ],
      },
      select: { id: true, crmStartDate: true, crmExpiryDate: true },
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
      crmStartDate: optionalDateValue(customer.member.crmStartDate) || null,
      crmExpiryDate: optionalDateValue(customer.member.crmExpiryDate) || null,
    };
    const member = existing
      ? await prisma.member.update({ where: { id: existing.id }, data })
      : await prisma.member.create({ data });
    savedMemberIds.add(member.id);
    if (!tradeIdsByMember.has(member.id)) tradeIdsByMember.set(member.id, new Set());
    let memberHasActiveIndicator = false;

    /* Window tracking: a new member — or one whose qualification dates just
       moved — needs fresh lots for the CURRENT window, not the persisted
       value from a previous one. */
    const day = (d: Date | null | undefined) => d ? d.toISOString().slice(0, 10) : null;
    const nextStart = day(data.crmStartDate as Date | null);
    const nextExpiry = day(data.crmExpiryDate as Date | null);
    if (!existing || day(existing.crmStartDate) !== nextStart || day(existing.crmExpiryDate) !== nextExpiry) {
      recomputeIds.push(member.id);
    }

    await prisma.memberAcquisitionChannel.deleteMany({ where: { memberId: member.id } });
    if (customer.member.channels?.length) {
      await prisma.memberAcquisitionChannel.createMany({ data: customer.member.channels.map((channel) => ({ memberId: member.id, channel })) });
    }

    for (const account of customer.accounts) {
      tradeIdsByMember.get(member.id)?.add(account.tradeId);
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

      if (account.indicatorName) {
        if (account.indicatorActive !== false) memberHasActiveIndicator = true;
        const indicatorId = await resolveIndicatorId(account.indicatorName, account.indicatorPubId);
        const existingAccess = await prisma.memberIndicatorAccess.findUnique({
          where: { memberId_indicatorId: { memberId: member.id, indicatorId } },
        });
        if (!existingAccess?.manualLock) {
          const startsAt = account.indicatorGrantedAt || existingAccess?.startsAt || new Date();
          const expiresAt = account.indicatorExpiresAt || existingAccess?.expiresAt || startsAt;
          const status = account.indicatorActive === false ? IndicatorAccessStatus.suspended : IndicatorAccessStatus.active;
          if (existingAccess) {
            await prisma.memberIndicatorAccess.update({
              where: { id: existingAccess.id },
              data: { status, startsAt, expiresAt },
            });
          } else {
            await prisma.memberIndicatorAccess.create({
              data: { memberId: member.id, indicatorId, status, source: AccessSource.Broker, startsAt, expiresAt },
            });
          }
        }
      }
    }

    /* Derive one TelegramAccess row from the member's own telegram contact
       info (the sync payload carries no room/status). */
    await upsertTelegramFromMember(
      member.id,
      customer.member.telegramUsername,
      customer.member.telegramUserId,
      memberHasActiveIndicator,
    );
  }

  let removedTradeAccounts = 0;
  for (const [memberId, tradeIds] of tradeIdsByMember) {
    const removed = await prisma.tradeAccount.deleteMany({
      where: { memberId, ...(tradeIds.size ? { tradeId: { notIn: [...tradeIds] } } : {}) },
    });
    removedTradeAccounts += removed.count;
  }
  const removedMembers = await prisma.member.deleteMany({ where: { id: { notIn: [...savedMemberIds] } } });
  // Recompute lots for new/window-changed members immediately so no page ever
  // reads a stale-window snapshot. Capped per sync (the 4h snapshot cron
  // converges the rest); failures keep the old value — display layers fall
  // back to window-correct ledger math instead of a wrong-window number.
  const recomputeQueue = [...new Set(recomputeIds)].slice(0, 30);
  let recomputedLots = 0;
  for (let i = 0; i < recomputeQueue.length; i += 10) {
    const results = await Promise.all(recomputeQueue.slice(i, i + 10).map((id) => snapshotOneMemberLots(id).catch(() => null)));
    recomputedLots += results.filter((v) => v !== null).length;
  }
  await bumpDataVersion();
  return { removedMembers: removedMembers.count, removedTradeAccounts, recomputedLots };
}

export async function readDatabaseDtos() {
  const prisma = getPrisma();
  const records = await prisma.member.findMany({
    include: { acquisitionChannels: true, tradeAccounts: true },
    orderBy: { joinedAt: "desc" },
  });
  const members: CustomerMemberDto[] = records.map(toMemberDto);
  // Flag Trade IDs that appear on more than one account so the CRM can show it.
  const tradeIdCounts = new Map<string, number>();
  for (const member of records) {
    for (const account of member.tradeAccounts) {
      tradeIdCounts.set(account.tradeId, (tradeIdCounts.get(account.tradeId) ?? 0) + 1);
    }
  }
  const tradeAccounts: CustomerTradeAccountDto[] = records.flatMap((member) =>
    member.tradeAccounts.map((account) => (tradeIdCounts.get(account.tradeId) ?? 0) > 1
      ? { ...toTradeAccountDto(account), duplicateTradeId: true }
      : toTradeAccountDto(account)),
  );
  return { members, tradeAccounts };
}

let syncInFlight: Promise<Awaited<ReturnType<typeof syncCustomerMembersOnce>>> | null = null;

export async function syncCustomerMembers() {
  if (syncInFlight) return syncInFlight;
  syncInFlight = syncCustomerMembersOnce();
  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

async function syncCustomerMembersOnce() {
  const customers = await fetchCustomers();
  if (isDatabaseConfigured()) {
    if (!customers.length) throw new Error("CRM customers returned no rows; refusing to clear existing data");
    // A truncated/partial upstream response must not cascade-delete live data:
    // refuse the cleanup when the payload lost an implausible share of members.
    const existingMembers = await getPrisma().member.count();
    if (existingMembers > 20 && customers.length < existingMembers * 0.7) {
      throw new Error(`CRM customers returned ${customers.length} of ${existingMembers} members; refusing to delete data`);
    }
    const cleanup = await saveCustomers(customers);
    return { ...(await readDatabaseDtos()), ...cleanup, saved: customers.length, database: true };
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
