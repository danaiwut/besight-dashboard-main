import { Prisma, type Admin, type Broker, type Indicator, type MemberIndicatorAccess, type RenewalRecord, type TelegramAccess, type TradeAccount } from "@/generated/prisma/client";
import type { CustomerMemberDto, CustomerTradeAccountDto } from "./customerSync";

/* ── Single source of truth for CRM API ⇄ UI shapes ──
   Every read AND write route maps Prisma rows through these helpers so a row
   created/updated via POST/PUT/PATCH looks byte-identical to one read via GET. */

export type MemberWithRelations = Prisma.MemberGetPayload<{
  include: { acquisitionChannels: true; tradeAccounts: true };
}>;

export function toMemberDto(member: MemberWithRelations): CustomerMemberDto {
  return {
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
    crmStartDate: member.crmStartDate?.toISOString().slice(0, 10),
    crmExpiryDate: member.crmExpiryDate?.toISOString().slice(0, 10),
    createdDate: member.createdAt.toISOString().slice(0, 10),
    joinedDate: member.joinedAt.toISOString().slice(0, 10),
    channels: member.acquisitionChannels.map((item) => item.channel).filter((item): item is "facebook" | "instagram" | "tiktok" => ["facebook", "instagram", "tiktok"].includes(item)),
    primaryTradeAccountId: member.primaryTradeAccountId || undefined,
    plan: member.plan,
    requiredLotsOverride: member.requiredLotsOverride?.toNumber(),
    requiredLotsOverrideNote: member.requiredLotsOverrideNote || undefined,
    currentPeriodLots: member.currentPeriodLots.toNumber(),
    currentPeriodLotsAt: member.currentPeriodLotsAt?.toISOString(),
    currentPeriodLotsFrom: member.currentPeriodLotsFrom?.toISOString().slice(0, 10),
    currentPeriodLotsTo: member.currentPeriodLotsTo?.toISOString().slice(0, 10),
  };
}

export function toTradeAccountDto(account: TradeAccount): CustomerTradeAccountDto {
  return {
    id: account.id,
    memberId: account.memberId,
    brokerId: account.brokerId ?? 0,
    tradeId: account.tradeId,
    accountType: account.accountType || "Standard",
    partnerIb: account.partnerIb || "",
    verification: account.verification,
    createdDate: account.createdAt.toISOString().slice(0, 10),
    lastSync: (account.lastSyncAt || account.updatedAt).toISOString().slice(0, 10),
    status: account.status,
  };
}

export type BrokerDto = {
  id: number;
  name: string;
  logo: string;
  code: string;
  url: string;
  status: "active" | "inactive";
  importMethod: string;
};

export function toBrokerDto(broker: Broker): BrokerDto {
  return {
    id: broker.id,
    name: broker.name,
    logo: broker.logoUrl || "",
    code: broker.code,
    url: broker.url || "",
    status: broker.status,
    importMethod: broker.importMethod || "",
  };
}

export type IndicatorDto = {
  id: number;
  name: string;
  pubId: string;
  status: "active" | "inactive";
};

export function toIndicatorDto(indicator: Indicator): IndicatorDto {
  return {
    id: indicator.id,
    name: indicator.name,
    pubId: indicator.publicationId || "",
    status: indicator.status,
  };
}

const ACCESS_SOURCE_LABEL = {
  Broker: "Broker",
  Admin: "Admin",
  SpecialAccess: "Special Access",
  Plan: "Plan",
} as const;

export type IndicatorAccessDto = {
  id: number;
  memberId: number;
  indicator: string;
  status: "active" | "suspended" | "pending" | "expired";
  source: "Broker" | "Admin" | "Special Access" | "Plan";
  startDate: string;
  expiryDate: string;
  lastRenewalDate?: string;
};

export function toIndicatorAccessDto(
  indicatorName: string,
  access: MemberIndicatorAccess,
): IndicatorAccessDto {
  return {
    id: access.id,
    memberId: access.memberId,
    indicator: indicatorName,
    status: access.status,
    source: ACCESS_SOURCE_LABEL[access.source],
    startDate: access.startsAt.toISOString().slice(0, 10),
    expiryDate: access.expiresAt.toISOString().slice(0, 10),
    lastRenewalDate: access.lastRenewedAt?.toISOString().slice(0, 10),
  };
}

export type TelegramAccessDto = {
  id: number;
  memberId: number;
  username: string;
  userId: string;
  room: string;
  status: "active" | "pending" | "expired" | "banned";
  grantedDate?: string;
  expiryDate?: string;
};

export function toTelegramAccessDto(record: TelegramAccess): TelegramAccessDto {
  return {
    id: record.id,
    memberId: record.memberId,
    username: record.username || "",
    userId: record.userId || "",
    room: record.room,
    status: record.status,
    grantedDate: record.grantedAt?.toISOString().slice(0, 10),
    expiryDate: record.expiresAt?.toISOString().slice(0, 10),
  };
}

export type AdminDto = {
  id: number;
  name: string;
  email: string;
  role: string;
  owner: boolean;
};

export function toAdminDto(admin: Admin): AdminDto {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    owner: admin.isOwner,
  };
}

export type RenewalRecordDto = {
  id: number;
  memberId: number;
  indicator: string;
  period: string;
  qualifiedLots: number;
  requiredLots: number;
  renewed: boolean;
  oldExpiry?: string;
  newExpiry?: string;
  createdDate: string;
};

export function toRenewalRecordDto(
  indicatorName: string,
  record: RenewalRecord,
): RenewalRecordDto {
  return {
    id: Number(record.id),
    memberId: record.memberId,
    indicator: indicatorName,
    period: record.period,
    qualifiedLots: record.qualifiedLots.toNumber(),
    requiredLots: record.requiredLots.toNumber(),
    renewed: record.renewed,
    oldExpiry: record.oldExpiry?.toISOString().slice(0, 10),
    newExpiry: record.newExpiry?.toISOString().slice(0, 10),
    createdDate: record.createdAt.toISOString().slice(0, 10),
  };
}
