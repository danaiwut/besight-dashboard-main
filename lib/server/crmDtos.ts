import { Prisma, type Activity, type ActivityEnrollment, type Admin, type Broker, type Indicator, type MemberIndicatorAccess, type RenewalRecord, type TelegramAccess, type TradeAccount } from "@/generated/prisma/client";
import type { CustomerMemberDto, CustomerTradeAccountDto } from "./customerSync";
import type { ActivityDto, ActivityEnrollmentDto, CompetitionPrizeDto, RewardClaimDto, RewardTierDto } from "../activities";

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
    discordUserId: member.discordUserId || undefined,
    lineUserId: member.lineUserId || undefined,
    lineDisplayName: member.lineDisplayName || undefined,
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
  /** Admin-only: the EA download link (Google Drive etc.). */
  eaFile?: string;
  hasEa: boolean;
};

export function toIndicatorDto(indicator: Indicator): IndicatorDto {
  return {
    id: indicator.id,
    name: indicator.name,
    pubId: indicator.publicationId || "",
    status: indicator.status,
    eaFile: indicator.eaFileUrl || undefined,
    hasEa: Boolean(indicator.eaFileUrl),
  };
}

/** Member-facing variant: says whether an EA download exists but never the
 *  link itself — that is only released by /api/me/ea-download after the
 *  member accepts the EA policy (and the acceptance is logged). */
export function toMemberIndicatorDto(indicator: Indicator): IndicatorDto {
  const { eaFile: _eaFile, ...dto } = toIndicatorDto(indicator);
  void _eaFile;
  return dto;
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
  /** `auto` = lot-check automation/cron, `manual` = admin Grant/Extend. */
  origin: string;
  note?: string;
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
    origin: record.origin,
    note: record.note || undefined,
    oldExpiry: record.oldExpiry?.toISOString().slice(0, 10),
    newExpiry: record.newExpiry?.toISOString().slice(0, 10),
    createdDate: record.createdAt.toISOString().slice(0, 10),
  };
}

export function toActivityDto(
  activity: Activity & { _count?: { enrollments: number }; prizes?: Array<{ id: number; rankFrom: number; rankTo: number; title: string; valueNote: string | null; sortOrder: number }> },
  enrolled = false,
  registrationOpen?: boolean,
  extras?: { enrolledTradeId?: string },
): ActivityDto {
  return {
    id: activity.id,
    slug: activity.slug,
    title: activity.title,
    description: activity.description || "",
    status: activity.status,
    startDate: activity.startDate.toISOString().slice(0, 10),
    endDate: activity.endDate.toISOString().slice(0, 10),
    // Real registration count — the hand-typed column is only a fallback for
    // rows created before enrollments existed.
    traders: activity._count?.enrollments ?? activity.traders,
    prizePool: activity.prizePool.toNumber(),
    coverImage: activity.coverImage || undefined,
    visibleFrom: activity.visibleFrom?.toISOString().slice(0, 10),
    registrationOpensAt: activity.registrationOpensAt?.toISOString().slice(0, 10),
    registrationOpen,
    rules: (activity.rules || "").split("\n").map((line) => line.trim()).filter(Boolean),
    published: activity.published,
    sortOrder: activity.sortOrder,
    enrolled,
    mode: activity.mode === "demo_legacy" ? "demo_legacy" : "registered",
    winnersFinalizedAt: activity.winnersFinalizedAt?.toISOString(),
    enrolledTradeId: extras?.enrolledTradeId,
    prizes: (activity.prizes ?? [])
      .map((prize) => ({
        id: prize.id,
        rankFrom: prize.rankFrom,
        rankTo: prize.rankTo,
        title: prize.title,
        valueNote: prize.valueNote || undefined,
        sortOrder: prize.sortOrder,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.rankFrom - b.rankFrom),
  };
}

export type { ActivityEnrollmentDto };

export type CompetitionPrizeInput = { id: number; rankFrom: number; rankTo: number; title: string; valueNote: string | null; sortOrder: number };

export function toCompetitionPrizeDto(prize: CompetitionPrizeInput): CompetitionPrizeDto {
  return {
    id: prize.id,
    rankFrom: prize.rankFrom,
    rankTo: prize.rankTo,
    title: prize.title,
    valueNote: prize.valueNote || undefined,
    sortOrder: prize.sortOrder,
  };
}

export function toRewardTierDto(tier: {
  id: number; key: string; title: string; titleEn: string | null; threshold: unknown; reward: string; rewardEn: string | null;
  icon: string; image: string | null; accent: string; sortOrder: number; active: boolean;
}): RewardTierDto {
  const threshold = typeof tier.threshold === "object" && tier.threshold !== null && "toNumber" in tier.threshold
    ? (tier.threshold as { toNumber: () => number }).toNumber()
    : Number(tier.threshold);
  return {
    id: tier.id,
    key: tier.key,
    title: tier.title,
    titleEn: tier.titleEn || undefined,
    threshold,
    reward: tier.reward,
    rewardEn: tier.rewardEn || undefined,
    icon: tier.icon,
    image: tier.image || undefined,
    accent: tier.accent,
    sortOrder: tier.sortOrder,
    active: tier.active,
  };
}

export function toRewardClaimDto(row: {
  id: number; memberId: number; kind: string; refKey: string; activityId: number | null;
  title: string; detail: string | null; status: string; note: string | null;
  createdAt: Date; decidedAt: Date | null;
  member: { code: string; name: string; displayName: string | null };
  activity: { title: string } | null;
}): RewardClaimDto {
  const kind = row.kind === "competition" || row.kind === "manual" ? row.kind : "tier";
  const status = row.status === "fulfilled" || row.status === "cancelled" ? row.status : "pending";
  return {
    id: row.id,
    memberId: row.memberId,
    memberCode: row.member.code,
    memberName: row.member.displayName?.trim() || row.member.name,
    kind,
    refKey: row.refKey,
    activityId: row.activityId ?? undefined,
    activityTitle: row.activity?.title,
    title: row.title,
    detail: row.detail || undefined,
    status,
    note: row.note || undefined,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString(),
  };
}

export function toActivityEnrollmentDto(
  row: ActivityEnrollment & { member: { code: string; name: string; displayName: string | null; email: string | null } },
): ActivityEnrollmentDto {
  return {
    id: row.id,
    memberId: row.memberId,
    memberCode: row.member.code,
    memberName: row.member.displayName?.trim() || row.member.name,
    email: row.member.email || "",
    tradeId: row.tradeId || "",
    isDemo: row.isDemo,
    verified: Boolean(row.verifiedAt),
    verificationNote: row.verificationNote || undefined,
    lots: row.lots.toNumber(),
    lotsAt: row.lotsAt?.toISOString(),
    joinedAt: row.createdAt.toISOString().slice(0, 10),
  };
}
