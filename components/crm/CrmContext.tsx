"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/* ── BeSight CRM data model ──
   Member 1:N TradeAccount (never a comma-joined string — a real relation).
   Indicator access & Telegram access are their own tables so multi-indicator /
   multi-room support is a schema change away, not a rewrite. Everything here
   is in-memory mock state shaped exactly like the eventual DB tables
   (members, trade_accounts, brokers, member_indicator_access, lot_records,
   renewal_history, telegram_access, activity_logs, system_settings) so
   swapping in a real backend later is a data-layer change, not a UI one. */

export type VerificationStatus = "verified" | "pending" | "not_found";
export type TradeAccountStatus = "active" | "inactive";

export type TradeAccount = {
  id: number;
  memberId: number;
  brokerId: number;
  tradeId: string;
  accountType: string;
  partnerIb: string;
  verification: VerificationStatus;
  createdDate: string;
  lastSync: string;
  status: TradeAccountStatus;
};

/** One row per individual trade a member's account logs — symbol, lot size,
 *  rebate and the date it was opened. TradeAccount no longer stores its own
 *  lots/rebate numbers directly; those are always derived by summing this
 *  ledger (see accountLots/accountRebate below), so there is exactly one
 *  place lot/rebate data can ever be written, and the displayed totals can
 *  never drift out of sync with the trade history they're built from. */
export type TradeLog = {
  id: number;
  tradeAccountId: number;
  memberId: number;
  symbol: string;
  lots: number;
  rebate: number;
  tradeDate: string;
};

export type Broker = {
  id: number;
  name: string;
  logo: string;
  code: string;
  url: string;
  status: "active" | "inactive";
  importMethod: string;
};

export type IndicatorAccessStatus = "active" | "suspended" | "pending" | "expired";
export type AccessSource = "Broker" | "Admin" | "Special Access" | "Plan";

export type Plan = "free" | "ib_partner";
export const PLAN_LABELS: Record<Plan, string> = { free: "Free", ib_partner: "IB Partner" };

export type Indicator = { id: number; name: string; pubId: string; status: "active" | "inactive"; eaFile?: string };

export type IndicatorAccess = {
  id: number;
  memberId: number;
  indicator: string;
  status: IndicatorAccessStatus;
  source: AccessSource;
  startDate: string;
  expiryDate: string;
  lastRenewalDate?: string;
};

export type TelegramStatus = "active" | "pending" | "expired" | "banned";

export type TelegramAccess = {
  id: number;
  memberId: number;
  username: string;
  userId: string;
  room: string;
  status: TelegramStatus;
  grantedDate?: string;
  expiryDate?: string;
};

export type RenewalRecord = {
  id: number;
  memberId: number;
  indicator: string;
  period: string;
  qualifiedLots: number;
  renewed: boolean;
  oldExpiry: string;
  newExpiry?: string;
  createdDate: string;
};

export type ActivityLog = {
  id: number;
  timestamp: string;
  actor: string;
  memberId?: number;
  memberName?: string;
  action: string;
  description: string;
};

export type AcquisitionChannel = "facebook" | "instagram" | "tiktok";
export const ACQUISITION_CHANNELS: AcquisitionChannel[] = ["facebook", "instagram", "tiktok"];
export const ACQUISITION_CHANNEL_LABELS: Record<AcquisitionChannel, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export type Member = {
  id: number;
  code: string;
  name: string;
  /** Public-facing name shown in menus/greetings — falls back to `name` (see displayNameOf) when not set. */
  displayName?: string;
  /** Data URL or image path for the account avatar — falls back to initials when not set. */
  avatarUrl?: string;
  email: string;
  phone: string;
  country?: string;
  address?: string;
  tv: string;
  telegramUsername?: string;
  telegramUserId?: string;
  discordUsername?: string;
  /** Demo-only connect/disconnect state for the profile page's Social Media section — no real OAuth backing it. */
  socialLinks?: { google?: boolean; line?: boolean; facebook?: boolean };
  createdDate: string;
  joinedDate: string;
  crmStartDate?: string;
  crmExpiryDate?: string;
  /** Where this member first heard about BeSight — admin-tagged, multi-select. */
  channels?: AcquisitionChannel[];
  primaryTradeAccountId?: number;
  plan: Plan;
  /** Case-by-case admin override of the monthly lot requirement — replaces Settings.requiredLots for this member only. */
  requiredLotsOverride?: number;
  requiredLotsOverrideNote?: string;
  /** Manual override of the auto-detected customer lifecycle tag (see customerStage()) — replaces the derived value for this member only. */
  customerStageOverride?: CustomerStage;
};

export type Admin = { id: number; name: string; email: string; role: string; owner?: boolean };

export const SUSPEND_REASON_LABELS: Record<string, string> = {
  fraud: "Fraudulent trade accounts",
  inactive: "Inactive / not trading",
  broker_left: "Left partner broker",
  request: "Member requested removal",
  other: "Other",
};

export const ROLE_DESC: Record<string, string> = {
  Owner: "Full access — members, brokers & all settings",
  Admin: "Manage members, brokers, indicator & telegram access",
  Support: "View & edit members, no settings",
  Viewer: "Read-only across all panels",
};
export const ROLES = ["Admin", "Support", "Viewer"];

/** The customer-facing dashboard (app/dashboard) has no real login session
 *  yet, so it demos as this one member — swap for the authenticated
 *  member's id once auth exists. */
export const CURRENT_MEMBER_ID = 1;

export type LotCalculationMode = "sum_all_verified" | "selected_only";

export type Settings = {
  requiredLots: number;
  renewalPeriodMonths: number;
  expiringSoonDays: number;
  autoRenewalEnabled: boolean;
  lotCalculationMode: LotCalculationMode;
  telegramBotToken: string;
  telegramPrivateRoomId: string;
  telegramAutoRemove: boolean;
  /** Which indicator IDs each plan entitles a member to — drives auto-grant
   *  on top of (never instead of) manual Grant/Suspend/Revoke, so admins
   *  keep full override control per member. */
  planEntitlements: Record<Plan, number[]>;
};

/* ── Mock seed data ──
   Placeholder members for building/reviewing the UI — Phase 2 swaps this
   array for a real query. Dates are anchored around "today" so the
   Expiring Soon / Expired states in the demo are actually visible. */

const HANDWRITTEN_MEMBERS: Member[] = [
  { id: 1, code: "BS-0001", name: "Somchai Wattana", email: "somchai.w@gmail.com", phone: "+66 81 234 5671", country: "Thailand", tv: "somchaifx", telegramUsername: "somchai_trade", telegramUserId: "5501234", createdDate: "2026-01-09", joinedDate: "2026-01-09", channels: ["facebook"], plan: "ib_partner" },
  { id: 2, code: "BS-0002", name: "Aisha Rahman", email: "aisha.rahman@gmail.com", phone: "+60 12 345 6782", country: "Malaysia", tv: "aisharfx", telegramUsername: "aisha_r", telegramUserId: "5501235", createdDate: "2025-11-20", joinedDate: "2025-11-20", channels: ["instagram", "tiktok"], plan: "ib_partner" },
  { id: 3, code: "BS-0003", name: "Marco Rossi", email: "marco.rossi@gmail.com", phone: "+39 345 123 4567", country: "Italy", tv: "marcofx", telegramUsername: "marco_r", telegramUserId: "5501236", createdDate: "2025-11-18", joinedDate: "2025-11-18", plan: "ib_partner" },
  { id: 4, code: "BS-0004", name: "Nina Patel", email: "nina.patel@gmail.com", phone: "+91 98765 43210", country: "India", tv: "ninap", telegramUsername: "nina_p", telegramUserId: "5501237", createdDate: "2026-01-30", joinedDate: "2026-01-30", channels: ["tiktok"], plan: "free" },
  { id: 5, code: "BS-0005", name: "Carlos Gomez", email: "c.gomez@gmail.com", phone: "+34 611 222 333", country: "Spain", tv: "carlosg", createdDate: "2026-03-05", joinedDate: "2026-03-05", plan: "free" },
  { id: 6, code: "BS-0006", name: "Priya Nair", email: "priya.nair@gmail.com", phone: "+91 90000 11122", country: "India", tv: "priyafx", telegramUsername: "priya_n", telegramUserId: "5501238", createdDate: "2025-12-04", joinedDate: "2025-12-04", channels: ["facebook", "instagram", "tiktok"], plan: "ib_partner" },
  { id: 7, code: "BS-0007", name: "Tom Becker", email: "tom.becker@web.de", phone: "+49 151 234 5678", country: "Germany", tv: "tbecker", createdDate: "2025-09-27", joinedDate: "2025-09-27", plan: "free" },
  { id: 8, code: "BS-0008", name: "Emma Chen", email: "emma.chen@gmail.com", phone: "+1 415 555 0142", country: "United States", tv: "emmac", telegramUsername: "emma_c", telegramUserId: "5501239", createdDate: "2026-08-01", joinedDate: "2026-08-01", channels: ["instagram"], plan: "free" },
  { id: 9, code: "BS-0009", name: "Liam O'Connor", email: "liam.oc@gmail.com", phone: "+353 87 123 4567", country: "Ireland", tv: "liamtrades", telegramUsername: "liam_oc", telegramUserId: "5501240", createdDate: "2025-12-02", joinedDate: "2025-12-02", plan: "ib_partner" },
  { id: 10, code: "BS-0010", name: "Daniel Reyes", email: "d.reyes@proton.me", phone: "+52 55 1234 5678", country: "Mexico", tv: "danreyes", telegramUsername: "dan_r", telegramUserId: "5501241", createdDate: "2026-02-14", joinedDate: "2026-02-14", channels: ["facebook", "tiktok"], plan: "free" },
];

/* ── Bulk demo data (deterministic, not random) ──
   Generates ~90 additional members + one trade account each, spread evenly
   across a 20-month window, so the Overview charts can be previewed at a
   realistic hundred-member scale instead of just the 10 handwritten rows. */
const BULK_FIRST_NAMES = [
  "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "William", "Elizabeth",
  "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen",
  "Chalermchai", "Siriporn", "Anand", "Priyanka", "Wei", "Mei", "Haruto", "Yuki", "Fatima", "Omar",
  "Layla", "Ahmed", "Sofia", "Lucas", "Isabella", "Mateo", "Valentina", "Diego", "Camila", "Andres",
  "Elena", "Nikolai", "Olga", "Piotr", "Katarzyna", "Erik", "Freya", "Lars", "Ingrid", "Kwame",
];
const BULK_LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
  "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
  "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
  "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
];
const BULK_PHONE_CODES = ["+66", "+60", "+39", "+91", "+34", "+49", "+353", "+52", "+1", "+81", "+82", "+65", "+61", "+44", "+33", "+971", "+27", "+55", "+7", "+48"];
const PHONE_CODE_COUNTRY: Record<string, string> = {
  "+66": "Thailand", "+60": "Malaysia", "+39": "Italy", "+91": "India", "+34": "Spain",
  "+49": "Germany", "+353": "Ireland", "+52": "Mexico", "+1": "United States", "+81": "Japan",
  "+82": "South Korea", "+65": "Singapore", "+61": "Australia", "+44": "United Kingdom", "+33": "France",
  "+971": "United Arab Emirates", "+27": "South Africa", "+55": "Brazil", "+7": "Russia", "+48": "Poland",
};
const BULK_MONTHS = [
  "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12",
  "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08",
];

/** Whatever "this month" resolves to when the app loads — seed trade-log
 *  dates are stamped against this (not a hardcoded month) so "lots this
 *  month" demo numbers stay non-zero regardless of when the app is run. */
const CURRENT_MONTH = new Date().toISOString().slice(0, 7);
export const SYMBOLS = ["GOLD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "NZDUSD", "USDCHF", "EURJPY", "GBPJPY"];

function generateBulkMembers(count: number, startId: number): Member[] {
  return Array.from({ length: count }, (_, i) => {
    const id = startId + i;
    const first = BULK_FIRST_NAMES[i % BULK_FIRST_NAMES.length];
    const last = BULK_LAST_NAMES[(i * 3 + 7) % BULK_LAST_NAMES.length];
    const mo = BULK_MONTHS[i % BULK_MONTHS.length];
    const day = String(((i * 7) % 27) + 1).padStart(2, "0");
    const joinedDate = `${mo}-${day}`;
    const phoneCode = BULK_PHONE_CODES[i % BULK_PHONE_CODES.length];
    const phoneDigits = String(1000000 + ((i * 9137) % 8999999));
    const channels: AcquisitionChannel[] = [];
    if (i % 3 === 0) channels.push("facebook");
    if (i % 4 === 0) channels.push("instagram");
    if (i % 5 === 0) channels.push("tiktok");
    return {
      id,
      code: `BS-${String(id).padStart(4, "0")}`,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${id}@gmail.com`,
      phone: `${phoneCode} ${phoneDigits.slice(0, 3)} ${phoneDigits.slice(3)}`,
      country: PHONE_CODE_COUNTRY[phoneCode],
      tv: `${first.toLowerCase()}${last.toLowerCase()}${id}`,
      createdDate: joinedDate,
      joinedDate,
      channels: channels.length ? channels : undefined,
      plan: i % 3 === 0 ? "ib_partner" : "free",
    } satisfies Member;
  });
}

const BULK_LOG_DAYS = ["04", "14", "24"];

function generateBulkTradeAccounts(bulkMembers: Member[], startId: number): { accounts: TradeAccount[]; logs: TradeLog[] } {
  const accounts: TradeAccount[] = [];
  const logs: TradeLog[] = [];
  let logId = 0;
  bulkMembers.forEach((m, i) => {
    const brokerId = (i % 2) + 1;
    const broker = INITIAL_BROKERS[brokerId - 1];
    const lots = Math.round((((i * 37) % 1500) / 100) * 10) / 10;
    const verification: VerificationStatus = i % 9 === 0 ? "pending" : "verified";
    const accountId = startId + i;
    accounts.push({
      id: accountId,
      memberId: m.id,
      brokerId,
      tradeId: String(70000000 + i * 91),
      accountType: "Standard",
      partnerIb: broker.code,
      verification,
      createdDate: m.joinedDate,
      lastSync: "2026-08-26",
      status: "active",
    } satisfies TradeAccount);
    if (lots > 0) {
      // Split each account's monthly total across 1-3 pairs/dates (more
      // pairs the more a member trades) so the demo data reads like a real
      // rebate ledger instead of one lump entry — while still summing back
      // to the exact same account totals other pages already rely on.
      const totalRebate = Math.round(lots * 20 * 10) / 10;
      const splitCount = lots >= 3 ? 3 : lots >= 1 ? 2 : 1;
      const weights = splitCount === 3 ? [0.45, 0.33, 0.22] : splitCount === 2 ? [0.6, 0.4] : [1];
      let lotsAcc = 0;
      let rebateAcc = 0;
      for (let k = 0; k < splitCount; k++) {
        const isLast = k === splitCount - 1;
        const l = isLast ? Math.round((lots - lotsAcc) * 100) / 100 : Math.round(lots * weights[k] * 100) / 100;
        const r = isLast ? Math.round((totalRebate - rebateAcc) * 100) / 100 : Math.round(totalRebate * weights[k] * 100) / 100;
        lotsAcc += l;
        rebateAcc += r;
        logId++;
        logs.push({
          id: logId,
          tradeAccountId: accountId,
          memberId: m.id,
          symbol: SYMBOLS[(i + k) % SYMBOLS.length],
          lots: l,
          rebate: r,
          tradeDate: `${CURRENT_MONTH}-${BULK_LOG_DAYS[k % BULK_LOG_DAYS.length]}`,
        } satisfies TradeLog);
      }
    }
  });
  return { accounts, logs };
}

const BULK_MEMBERS = generateBulkMembers(90, 11);
const INITIAL_MEMBERS: Member[] = [...HANDWRITTEN_MEMBERS, ...BULK_MEMBERS];

const INITIAL_BROKERS: Broker[] = [
  { id: 1, name: "Exness", logo: "/img/broker/logo_exness_white.svg", code: "BS-EX2049", url: "https://www.exness.com/", status: "active", importMethod: "CSV Import" },
  { id: 2, name: "XM", logo: "/img/broker/XM-Logo-White-RGB.png", code: "BSIMX", url: "https://www.xm.com/", status: "active", importMethod: "API" },
];

const HANDWRITTEN_TRADE_ACCOUNTS: TradeAccount[] = [
  { id: 1, memberId: 1, brokerId: 4, tradeId: "390894526", accountType: "Standard", partnerIb: "BSIMX", verification: "verified", createdDate: "2026-01-09", lastSync: "2026-08-26", status: "active" },
  { id: 2, memberId: 1, brokerId: 4, tradeId: "82707281", accountType: "Ultra Low", partnerIb: "BSIMX", verification: "verified", createdDate: "2026-02-11", lastSync: "2026-08-26", status: "active" },
  { id: 3, memberId: 2, brokerId: 2, tradeId: "41200981", accountType: "Raw Spread", partnerIb: "BS-IC7781", verification: "verified", createdDate: "2025-11-20", lastSync: "2026-08-25", status: "active" },
  { id: 4, memberId: 3, brokerId: 1, tradeId: "50491120", accountType: "Standard", partnerIb: "BS-EX2049", verification: "verified", createdDate: "2025-11-18", lastSync: "2026-08-26", status: "active" },
  { id: 5, memberId: 3, brokerId: 2, tradeId: "41200982", accountType: "Raw Spread", partnerIb: "BS-IC7781", verification: "verified", createdDate: "2025-12-01", lastSync: "2026-08-26", status: "active" },
  { id: 6, memberId: 3, brokerId: 4, tradeId: "82045514", accountType: "Standard", partnerIb: "BSIMX", verification: "pending", createdDate: "2026-06-10", lastSync: "2026-08-24", status: "active" },
  { id: 7, memberId: 4, brokerId: 4, tradeId: "82045513", accountType: "Standard", partnerIb: "BSIMX", verification: "verified", createdDate: "2026-01-30", lastSync: "2026-08-26", status: "active" },
  { id: 8, memberId: 5, brokerId: 5, tradeId: "10294455", accountType: "Standard", partnerIb: "BS-HF1029", verification: "not_found", createdDate: "2026-03-05", lastSync: "2026-08-20", status: "inactive" },
  { id: 9, memberId: 6, brokerId: 2, tradeId: "41200999", accountType: "Raw Spread", partnerIb: "BS-IC7781", verification: "verified", createdDate: "2025-12-04", lastSync: "2026-08-26", status: "active" },
  { id: 10, memberId: 7, brokerId: 3, tradeId: "61200945", accountType: "Standard", partnerIb: "BS-PS6120", verification: "not_found", createdDate: "2025-09-27", lastSync: "2026-08-10", status: "inactive" },
  { id: 11, memberId: 8, brokerId: 5, tradeId: "10294400", accountType: "Standard", partnerIb: "BS-HF1029", verification: "verified", createdDate: "2026-08-01", lastSync: "2026-08-26", status: "active" },
  { id: 12, memberId: 9, brokerId: 3, tradeId: "61200950", accountType: "Standard", partnerIb: "BS-PS6120", verification: "verified", createdDate: "2025-12-02", lastSync: "2026-08-26", status: "active" },
  { id: 13, memberId: 10, brokerId: 4, tradeId: "82045520", accountType: "Standard", partnerIb: "BSIMX", verification: "verified", createdDate: "2026-02-14", lastSync: "2026-08-26", status: "active" },
];

/** id: [tradeAccountId, memberId, lots, rebate] — one seed trade-log entry
 *  per handwritten account above, dated this month so existing "lots this
 *  month" demo numbers are unchanged now that they're derived, not stored. */
const HANDWRITTEN_TRADE_LOGS: TradeLog[] = [
  { id: 1, tradeAccountId: 1, memberId: 1, symbol: "GOLD", lots: 1.54, rebate: 30.78, tradeDate: `${CURRENT_MONTH}-05` },
  { id: 2, tradeAccountId: 1, memberId: 1, symbol: "EURUSD", lots: 1.13, rebate: 22.57, tradeDate: `${CURRENT_MONTH}-12` },
  { id: 3, tradeAccountId: 1, memberId: 1, symbol: "GBPUSD", lots: 0.75, rebate: 15.05, tradeDate: `${CURRENT_MONTH}-20` },
  { id: 4, tradeAccountId: 2, memberId: 1, symbol: "EURUSD", lots: 0.75, rebate: 11.25, tradeDate: `${CURRENT_MONTH}-05` },
  { id: 5, tradeAccountId: 2, memberId: 1, symbol: "GBPUSD", lots: 0.5, rebate: 7.5, tradeDate: `${CURRENT_MONTH}-12` },
  { id: 6, tradeAccountId: 3, memberId: 2, symbol: "GBPUSD", lots: 1.26, rebate: 18.9, tradeDate: `${CURRENT_MONTH}-05` },
  { id: 7, tradeAccountId: 3, memberId: 2, symbol: "USDJPY", lots: 0.84, rebate: 12.6, tradeDate: `${CURRENT_MONTH}-12` },
  { id: 8, tradeAccountId: 4, memberId: 3, symbol: "USDJPY", lots: 5.4, rebate: 108, tradeDate: `${CURRENT_MONTH}-05` },
  { id: 9, tradeAccountId: 4, memberId: 3, symbol: "AUDUSD", lots: 3.96, rebate: 79.2, tradeDate: `${CURRENT_MONTH}-12` },
  { id: 10, tradeAccountId: 4, memberId: 3, symbol: "USDCAD", lots: 2.64, rebate: 52.8, tradeDate: `${CURRENT_MONTH}-20` },
  { id: 11, tradeAccountId: 5, memberId: 3, symbol: "AUDUSD", lots: 2.93, rebate: 43.88, tradeDate: `${CURRENT_MONTH}-05` },
  { id: 12, tradeAccountId: 5, memberId: 3, symbol: "USDCAD", lots: 2.15, rebate: 32.18, tradeDate: `${CURRENT_MONTH}-12` },
  { id: 13, tradeAccountId: 5, memberId: 3, symbol: "NZDUSD", lots: 1.42, rebate: 21.44, tradeDate: `${CURRENT_MONTH}-20` },
  { id: 14, tradeAccountId: 6, memberId: 3, symbol: "USDCAD", lots: 1.58, rebate: 0, tradeDate: `${CURRENT_MONTH}-05` },
  { id: 15, tradeAccountId: 6, memberId: 3, symbol: "NZDUSD", lots: 1.16, rebate: 0, tradeDate: `${CURRENT_MONTH}-12` },
  { id: 16, tradeAccountId: 6, memberId: 3, symbol: "USDCHF", lots: 0.76, rebate: 0, tradeDate: `${CURRENT_MONTH}-20` },
  { id: 17, tradeAccountId: 7, memberId: 4, symbol: "EURJPY", lots: 2.52, rebate: 50.4, tradeDate: `${CURRENT_MONTH}-05` },
  { id: 18, tradeAccountId: 7, memberId: 4, symbol: "GBPJPY", lots: 1.85, rebate: 36.96, tradeDate: `${CURRENT_MONTH}-12` },
  { id: 19, tradeAccountId: 7, memberId: 4, symbol: "GOLD", lots: 1.23, rebate: 24.64, tradeDate: `${CURRENT_MONTH}-20` },
  { id: 20, tradeAccountId: 9, memberId: 6, symbol: "GBPJPY", lots: 1.8, rebate: 27, tradeDate: `${CURRENT_MONTH}-05` },
  { id: 21, tradeAccountId: 9, memberId: 6, symbol: "GOLD", lots: 1.32, rebate: 19.8, tradeDate: `${CURRENT_MONTH}-12` },
  { id: 22, tradeAccountId: 9, memberId: 6, symbol: "EURUSD", lots: 0.88, rebate: 13.2, tradeDate: `${CURRENT_MONTH}-20` },
  { id: 23, tradeAccountId: 11, memberId: 8, symbol: "NZDUSD", lots: 1.08, rebate: 16.2, tradeDate: `${CURRENT_MONTH}-05` },
  { id: 24, tradeAccountId: 11, memberId: 8, symbol: "USDCHF", lots: 0.72, rebate: 10.8, tradeDate: `${CURRENT_MONTH}-12` },
  { id: 25, tradeAccountId: 12, memberId: 9, symbol: "USDCHF", lots: 2.93, rebate: 58.5, tradeDate: `${CURRENT_MONTH}-05` },
  { id: 26, tradeAccountId: 12, memberId: 9, symbol: "EURJPY", lots: 2.15, rebate: 42.9, tradeDate: `${CURRENT_MONTH}-12` },
  { id: 27, tradeAccountId: 12, memberId: 9, symbol: "GBPJPY", lots: 1.42, rebate: 28.6, tradeDate: `${CURRENT_MONTH}-20` },
  { id: 28, tradeAccountId: 13, memberId: 10, symbol: "GOLD", lots: 1.14, rebate: 17.1, tradeDate: `${CURRENT_MONTH}-05` },
  { id: 29, tradeAccountId: 13, memberId: 10, symbol: "EURUSD", lots: 0.76, rebate: 11.4, tradeDate: `${CURRENT_MONTH}-12` },
  // Extra activity on member 1's two XM accounts — the customer-facing
  // dashboard (app/dashboard) is demoed as this member, so it needs a
  // fuller trade history than the 3-4 rows every other seed member has.
  { id: 30, tradeAccountId: 1, memberId: 1, symbol: "USDJPY", lots: 2.10, rebate: 42.00, tradeDate: `${CURRENT_MONTH}-02` },
  { id: 31, tradeAccountId: 1, memberId: 1, symbol: "AUDUSD", lots: 1.85, rebate: 37.00, tradeDate: `${CURRENT_MONTH}-07` },
  { id: 32, tradeAccountId: 1, memberId: 1, symbol: "GOLD", lots: 3.20, rebate: 64.00, tradeDate: `${CURRENT_MONTH}-15` },
  { id: 33, tradeAccountId: 1, memberId: 1, symbol: "EURJPY", lots: 1.40, rebate: 28.00, tradeDate: `${CURRENT_MONTH}-23` },
  { id: 34, tradeAccountId: 1, memberId: 1, symbol: "GBPUSD", lots: 2.65, rebate: 53.00, tradeDate: `${CURRENT_MONTH}-27` },
  { id: 35, tradeAccountId: 2, memberId: 1, symbol: "NZDUSD", lots: 1.20, rebate: 24.00, tradeDate: `${CURRENT_MONTH}-03` },
  { id: 36, tradeAccountId: 2, memberId: 1, symbol: "USDCHF", lots: 0.95, rebate: 19.00, tradeDate: `${CURRENT_MONTH}-09` },
  { id: 37, tradeAccountId: 2, memberId: 1, symbol: "GOLD", lots: 1.75, rebate: 35.00, tradeDate: `${CURRENT_MONTH}-16` },
  { id: 38, tradeAccountId: 2, memberId: 1, symbol: "EURUSD", lots: 1.10, rebate: 22.00, tradeDate: `${CURRENT_MONTH}-24` },
  { id: 39, tradeAccountId: 2, memberId: 1, symbol: "GBPJPY", lots: 1.35, rebate: 27.00, tradeDate: `${CURRENT_MONTH}-28` },
];

const BULK_TRADE_DATA = generateBulkTradeAccounts(BULK_MEMBERS, 14);
const INITIAL_TRADE_ACCOUNTS: TradeAccount[] = [...HANDWRITTEN_TRADE_ACCOUNTS, ...BULK_TRADE_DATA.accounts];
const INITIAL_TRADE_LOGS: TradeLog[] = [
  ...HANDWRITTEN_TRADE_LOGS,
  ...BULK_TRADE_DATA.logs.map((l) => ({ ...l, id: l.id + HANDWRITTEN_TRADE_LOGS.length })),
];

const INITIAL_INDICATORS: Indicator[] = [
  { id: 1, name: "BeSight One STR", pubId: "75ee20d5bee6431c9bdef0282d58fdd3", status: "active" },
  { id: 2, name: "Besight Orca", pubId: "341c1526463b46f198b3f2ee63d9bf4a", status: "active" },
];

const INITIAL_INDICATOR_ACCESS: IndicatorAccess[] = [
  // Live access records are loaded from the database on provider mount.
];

const INITIAL_TELEGRAM_ACCESS: TelegramAccess[] = [
  { id: 1, memberId: 1, username: "somchai_trade", userId: "5501234", room: "BeSight VIP Signals", status: "active", grantedDate: "2026-01-09" },
  { id: 2, memberId: 2, username: "aisha_r", userId: "5501235", room: "BeSight VIP Signals", status: "expired", grantedDate: "2025-11-20", expiryDate: "2026-06-20" },
  { id: 3, memberId: 3, username: "marco_r", userId: "5501236", room: "BeSight VIP Signals", status: "active", grantedDate: "2025-11-18" },
  { id: 4, memberId: 4, username: "nina_p", userId: "5501237", room: "BeSight VIP Signals", status: "active", grantedDate: "2026-01-30" },
  { id: 5, memberId: 6, username: "priya_n", userId: "5501238", room: "BeSight VIP Signals", status: "banned", grantedDate: "2025-12-04" },
  { id: 6, memberId: 8, username: "emma_c", userId: "5501239", room: "BeSight VIP Signals", status: "pending", grantedDate: "2026-08-01" },
  { id: 7, memberId: 9, username: "liam_oc", userId: "5501240", room: "BeSight VIP Signals", status: "active", grantedDate: "2025-12-02" },
  { id: 8, memberId: 10, username: "dan_r", userId: "5501241", room: "BeSight VIP Signals", status: "active", grantedDate: "2026-02-14" },
];

const INITIAL_RENEWAL_HISTORY: RenewalRecord[] = [
  { id: 1, memberId: 1, indicator: "BeSight ONE", period: "2026-07", qualifiedLots: 3.82, renewed: true, oldExpiry: "2026-07-31", newExpiry: "2026-08-31", createdDate: "2026-07-31" },
  { id: 2, memberId: 3, indicator: "BeSight ONE", period: "2026-08", qualifiedLots: 21.5, renewed: true, oldExpiry: "2026-08-18", newExpiry: "2027-01-18", createdDate: "2026-08-18" },
  { id: 3, memberId: 9, indicator: "BeSight ONE", period: "2026-08", qualifiedLots: 6.5, renewed: true, oldExpiry: "2026-08-02", newExpiry: "2027-02-02", createdDate: "2026-08-02" },
  { id: 4, memberId: 2, indicator: "BeSight ONE", period: "2026-06", qualifiedLots: 1.4, renewed: false, oldExpiry: "2026-06-20", createdDate: "2026-06-20" },
  { id: 5, memberId: 3, indicator: "BeSight Orca", period: "2026-09", qualifiedLots: 21.5, renewed: true, oldExpiry: "2026-09-01", newExpiry: "2026-10-01", createdDate: "2026-09-01" },
];

const INITIAL_ACTIVITY_LOGS: ActivityLog[] = [];

const DEFAULT_SETTINGS: Settings = {
  requiredLots: 3.0,
  renewalPeriodMonths: 1,
  expiringSoonDays: 7,
  autoRenewalEnabled: true,
  lotCalculationMode: "sum_all_verified",
  telegramBotToken: "",
  telegramPrivateRoomId: "",
  telegramAutoRemove: true,
  planEntitlements: { free: [2, 3], ib_partner: [1, 2] },
};

const INITIAL_ADMINS: Admin[] = [
  { id: 1, name: "Alex Dean", email: "alex.dean@besight.com", role: "Owner", owner: true },
  { id: 2, name: "Maria Lopez", email: "maria@besight.com", role: "Admin" },
  { id: 3, name: "Sam Wright", email: "sam@besight.com", role: "Support" },
];

type CrmContextValue = {
  members: Member[];
  setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
  tradeAccounts: TradeAccount[];
  setTradeAccounts: React.Dispatch<React.SetStateAction<TradeAccount[]>>;
  tradeLogs: TradeLog[];
  setTradeLogs: React.Dispatch<React.SetStateAction<TradeLog[]>>;
  brokers: Broker[];
  setBrokers: React.Dispatch<React.SetStateAction<Broker[]>>;
  indicators: Indicator[];
  setIndicators: React.Dispatch<React.SetStateAction<Indicator[]>>;
  indicatorAccess: IndicatorAccess[];
  setIndicatorAccess: React.Dispatch<React.SetStateAction<IndicatorAccess[]>>;
  telegramAccess: TelegramAccess[];
  setTelegramAccess: React.Dispatch<React.SetStateAction<TelegramAccess[]>>;
  renewalHistory: RenewalRecord[];
  setRenewalHistory: React.Dispatch<React.SetStateAction<RenewalRecord[]>>;
  activityLogs: ActivityLog[];
  setActivityLogs: React.Dispatch<React.SetStateAction<ActivityLog[]>>;
  admins: Admin[];
  setAdmins: React.Dispatch<React.SetStateAction<Admin[]>>;
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  toast: (msg: string) => void;
  toastMsg: string;
  toastShow: boolean;
  log: (entry: Omit<ActivityLog, "id" | "timestamp">) => void;
  runRenewalCheck: () => { renewed: number; expired: number };
  syncPlanAccess: (memberId: number, plan: Plan, memberName: string) => number;
  memberSyncStatus: "idle" | "loading" | "live" | "error";
  memberSyncError: string;
  refreshMembers: () => Promise<void>;
};

const CrmContext = createContext<CrmContextValue | null>(null);

export function CrmProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<Member[]>(INITIAL_MEMBERS);
  const [tradeAccounts, setTradeAccounts] = useState<TradeAccount[]>(INITIAL_TRADE_ACCOUNTS);
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>(INITIAL_TRADE_LOGS);
  const [brokers, setBrokers] = useState<Broker[]>(INITIAL_BROKERS);
  const [indicators, setIndicators] = useState<Indicator[]>(INITIAL_INDICATORS);
  const [indicatorAccess, setIndicatorAccess] = useState<IndicatorAccess[]>(INITIAL_INDICATOR_ACCESS);
  const [telegramAccess, setTelegramAccess] = useState<TelegramAccess[]>(INITIAL_TELEGRAM_ACCESS);
  const [renewalHistory, setRenewalHistory] = useState<RenewalRecord[]>(INITIAL_RENEWAL_HISTORY);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>(INITIAL_ACTIVITY_LOGS);
  const [admins, setAdmins] = useState<Admin[]>(INITIAL_ADMINS);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [toastMsg, setToastMsg] = useState("");
  const [toastShow, setToastShow] = useState(false);
  const [memberSyncStatus, setMemberSyncStatus] = useState<"idle" | "loading" | "live" | "error">("idle");
  const [memberSyncError, setMemberSyncError] = useState("");

  const refreshMembers = useCallback(async () => {
    setMemberSyncStatus("loading");
    setMemberSyncError("");
    try {
      const response = await fetch("/api/crm/customers/sync/", { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; error?: string; members?: Member[]; tradeAccounts?: TradeAccount[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || `Customer sync failed (${response.status})`);
      if (payload.members?.length) setMembers(payload.members);
      if (payload.tradeAccounts) setTradeAccounts(payload.tradeAccounts);
      setMemberSyncStatus("live");
    } catch (error) {
      setMemberSyncStatus("error");
      setMemberSyncError(error instanceof Error ? error.message : "Customer sync failed");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshMembers(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshMembers]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/indicators/", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as {
          ok?: boolean;
          indicators?: Indicator[];
          indicatorAccess?: IndicatorAccess[];
          planEntitlements?: Record<Plan, number[]>;
        };
        if (cancelled || !response.ok || !payload.ok) return;
        if (payload.indicators) setIndicators(payload.indicators);
        if (payload.indicatorAccess) setIndicatorAccess(payload.indicatorAccess);
        if (payload.planEntitlements) setSettings((current) => ({ ...current, planEntitlements: payload.planEntitlements! }));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/activity-logs/?limit=2000", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; activityLogs?: ActivityLog[] };
        if (!cancelled && response.ok && payload.ok && payload.activityLogs) setActivityLogs(payload.activityLogs);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  function toast(msg: string) {
    setToastMsg(msg);
    setToastShow(true);
    setTimeout(() => setToastShow(false), 1800);
  }

  function log(entry: Omit<ActivityLog, "id" | "timestamp">) {
    setActivityLogs((cur) => [
      { id: Math.max(0, ...cur.map((l) => l.id)) + 1, timestamp: new Date().toISOString(), ...entry },
      ...cur,
    ]);
    void fetch("/api/crm/activity-logs/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }).catch(() => undefined);
  }

  /* Idempotent by design: a renewal is only written once per (memberId,
     indicator, period) — re-running this (e.g. a cron firing twice) just
     no-ops for grants already renewed this period, matching the "unique
     member + qualification month" rule from the spec. Keyed by indicator
     too since one member can hold access to more than one indicator
     (e.g. both BeSight ONE and BeSight Orca) with independent renewal
     clocks. New history rows are accumulated locally (not read back via
     the `renewalHistory` closure) so two grants for the same member
     renewing in the same pass don't race each other. */
  function runRenewalCheck() {
    const period = new Date().toISOString().slice(0, 7);
    let renewed = 0;
    let expired = 0;
    const newHistory: RenewalRecord[] = [];
    const newLogs: Omit<ActivityLog, "id" | "timestamp">[] = [];
    const today = new Date().toISOString().slice(0, 10);

    setIndicatorAccess((curAccess) =>
      curAccess.map((access) => {
        if (access.status !== "active") return access;
        const member = members.find((m) => m.id === access.memberId);
        if (!member) return access;

        const alreadyDone =
          renewalHistory.some((r) => r.memberId === member.id && r.indicator === access.indicator && r.period === period) ||
          newHistory.some((r) => r.memberId === member.id && r.indicator === access.indicator && r.period === period);
        if (alreadyDone) return access;

        const lots = memberLots(member, tradeAccounts, tradeLogs, settings);
        const required = requiredLotsFor(member, settings);
        const qualifies = lots >= required;
        const daysLeft = daysUntil(access.expiryDate);

        if (qualifies && settings.autoRenewalEnabled) {
          const oldExpiry = access.expiryDate;
          const newExpiry = addMonths(oldExpiry, settings.renewalPeriodMonths);
          newHistory.push({ id: 0, memberId: member.id, indicator: access.indicator, period, qualifiedLots: lots, renewed: true, oldExpiry, newExpiry, createdDate: today });
          newLogs.push({ actor: "System", memberId: member.id, memberName: member.name, action: "Indicator Renewed", description: `${access.indicator}: qualified ${lot(lots)} / ${lot(required)} lots. Expiry changed ${oldExpiry} → ${newExpiry}.` });
          renewed++;
          return { ...access, expiryDate: newExpiry, lastRenewalDate: today };
        }

        if (!qualifies && daysLeft < 0) {
          newHistory.push({ id: 0, memberId: member.id, indicator: access.indicator, period, qualifiedLots: lots, renewed: false, oldExpiry: access.expiryDate, createdDate: today });
          newLogs.push({ actor: "System", memberId: member.id, memberName: member.name, action: "Indicator Expired", description: `${access.indicator}: lots ${lot(lots)} / ${lot(required)} not met by expiry. Access expired.` });
          expired++;
          return { ...access, status: "expired" as const };
        }

        return access;
      })
    );

    if (newHistory.length) {
      setRenewalHistory((cur) => {
        let nextId = Math.max(0, ...cur.map((r) => r.id));
        return [...newHistory.map((r) => ({ ...r, id: ++nextId })), ...cur];
      });
    }
    newLogs.forEach((entry) => log(entry));

    return { renewed, expired };
  }

  /* Plan → indicator entitlement is additive only: it fills in access the
     member's plan entitles them to but doesn't already have ANY record for
     (active, suspended, or even expired/revoked — a past manual revoke is
     never silently re-granted). It never removes access, so a manual grant
     that goes beyond the plan (e.g. Special Access on a Free member) or a
     manual restriction always wins — Manage stays the source of truth for
     anything the plan didn't set up. Returns how many grants it created. */
  function syncPlanAccess(memberId: number, plan: Plan, memberName: string): number {
    const entitledIds = settings.planEntitlements[plan] ?? [];
    const entitled = indicators.filter((i) => entitledIds.includes(i.id) && i.status === "active");
    const mine = indicatorAccess.filter((a) => a.memberId === memberId);
    const missing = entitled.filter((i) => !mine.some((a) => a.indicator === i.name));
    if (!missing.length) return 0;

    const today = new Date().toISOString().slice(0, 10);
    const expiry = addMonths(today, settings.renewalPeriodMonths);
    setIndicatorAccess((cur) => {
      let nextId = Math.max(0, ...cur.map((a) => a.id));
      const grants: IndicatorAccess[] = missing.map((i) => ({
        id: ++nextId,
        memberId,
        indicator: i.name,
        status: "active",
        source: "Plan",
        startDate: today,
        expiryDate: expiry,
      }));
      return [...grants, ...cur];
    });
    missing.forEach((i) =>
      log({ actor: "System", memberId, memberName, action: "Indicator Granted", description: `${i.name} auto-granted from the ${PLAN_LABELS[plan]} plan, expires ${expiry}.` })
    );
    return missing.length;
  }

  return (
    <CrmContext.Provider
      value={{
        members, setMembers,
        tradeAccounts, setTradeAccounts,
        tradeLogs, setTradeLogs,
        brokers, setBrokers,
        indicators, setIndicators,
        indicatorAccess, setIndicatorAccess,
        telegramAccess, setTelegramAccess,
        renewalHistory, setRenewalHistory,
        activityLogs, setActivityLogs,
        admins, setAdmins,
        settings, setSettings,
        toast, toastMsg, toastShow,
        log, runRenewalCheck, syncPlanAccess,
        memberSyncStatus, memberSyncError, refreshMembers,
      }}
    >
      {children}
    </CrmContext.Provider>
  );
}

export function useCrm() {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error("useCrm must be used within CrmProvider");
  return ctx;
}

/* ── Helpers ── */
export const initials = (n: string) =>
  n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export const displayNameOf = (m: Member) => m.displayName?.trim() || m.name;
export const lot = (n: number) => Number(n).toFixed(2);
export const fmtDate = (d?: string) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
export const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const brokerInitials = (n: string) =>
  n.replace(/[^A-Za-z ]/g, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "BK";

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00").getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86400000);
}

export function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** First and last day of the current calendar month — the same window
 *  memberLots/memberRebate use (accountLots/accountRebate default to "this
 *  calendar month" when no explicit DateRange is given). Built from local
 *  Y/M/D components rather than toISOString(), which converts to UTC and
 *  can roll the date back a day in timezones ahead of UTC. */
export function currentMonthRange(): DateRange {
  const now = new Date();
  const from = toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = toLocalISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return { from, to };
}

export function memberTradeAccounts(memberId: number, accounts: TradeAccount[]) {
  return accounts.filter((a) => a.memberId === memberId);
}

function isCurrentMonth(dateStr: string): boolean {
  return dateStr.slice(0, 7) === new Date().toISOString().slice(0, 7);
}

export type DateRange = { from?: string; to?: string };

function inRange(dateStr: string, range: DateRange): boolean {
  return (!range.from || dateStr >= range.from) && (!range.to || dateStr <= range.to);
}

/** Sums an account's trade-log entries dated in the given range (default: current calendar month) —
 *  this is the single place "lots this month" is computed from; nothing
 *  else stores or overwrites a lots number directly. */
export function accountLots(accountId: number, logs: TradeLog[], range?: DateRange): number {
  const matches = range ? (d: string) => inRange(d, range) : isCurrentMonth;
  return logs.filter((l) => l.tradeAccountId === accountId && matches(l.tradeDate)).reduce((s, l) => s + l.lots, 0);
}

export function accountRebate(accountId: number, logs: TradeLog[], range?: DateRange): number {
  const matches = range ? (d: string) => inRange(d, range) : isCurrentMonth;
  return logs.filter((l) => l.tradeAccountId === accountId && matches(l.tradeDate)).reduce((s, l) => s + l.rebate, 0);
}

function backfillHash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** Calendar days (YYYY-MM-DD) from `from` through `to`, inclusive. */
function daysInRange(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export type BackfillResult = { newLogs: TradeLog[]; totalLots: number; totalRebate: number };

/** Stands in for a broker's real historical-data API — fills only days that
 *  genuinely have no trade-log entry yet for a given account (a day the sync
 *  already picked up is left untouched, so re-running this never double-
 *  counts). Deterministic per account+day so the same backfill always
 *  produces the same numbers. */
export function backfillRebateData(accounts: TradeAccount[], from: string, to: string, existingLogs: TradeLog[], startId: number): BackfillResult {
  const today = new Date().toISOString().slice(0, 10);
  const clampedTo = to > today ? today : to;
  const days = from <= clampedTo ? daysInRange(from, clampedTo) : [];
  const existingKeys = new Set(existingLogs.map((l) => `${l.tradeAccountId}|${l.tradeDate}`));
  const newLogs: TradeLog[] = [];
  let nextId = startId;
  for (const account of accounts) {
    for (const day of days) {
      const key = `${account.id}|${day}`;
      if (existingKeys.has(key)) continue;
      const h = backfillHash(key);
      if (h % 6 === 0) continue; // some days genuinely had no trades
      const lots = Math.round((((h % 250) / 100 + 0.05)) * 100) / 100;
      const rebate = Math.round(lots * 20 * 100) / 100;
      newLogs.push({
        id: nextId++,
        tradeAccountId: account.id,
        memberId: account.memberId,
        symbol: SYMBOLS[h % SYMBOLS.length],
        lots,
        rebate,
        tradeDate: day,
      });
    }
  }
  return {
    newLogs,
    totalLots: Math.round(newLogs.reduce((s, l) => s + l.lots, 0) * 100) / 100,
    totalRebate: Math.round(newLogs.reduce((s, l) => s + l.rebate, 0) * 100) / 100,
  };
}

/** Respects Settings.lotCalculationMode — sum every verified account, or
 *  only the member's designated primary account (Mode B in the spec). */
export function memberLots(member: Member, accounts: TradeAccount[], logs: TradeLog[], settings: Settings): number {
  const mine = memberTradeAccounts(member.id, accounts);
  if (settings.lotCalculationMode === "selected_only") {
    const primary = mine.find((a) => a.id === member.primaryTradeAccountId) ?? mine[0];
    return primary && primary.verification === "verified" ? accountLots(primary.id, logs) : 0;
  }
  return mine.filter((a) => a.verification === "verified" && a.status === "active").reduce((s, a) => s + accountLots(a.id, logs), 0);
}

/** Same shape as memberLots, but sums accountRebate instead — this month's
 *  rebate rather than this month's lots. Used by the customer dashboard's
 *  "This Month's Rebate" stat. */
export function memberRebate(member: Member, accounts: TradeAccount[], logs: TradeLog[], settings: Settings): number {
  const mine = memberTradeAccounts(member.id, accounts);
  if (settings.lotCalculationMode === "selected_only") {
    const primary = mine.find((a) => a.id === member.primaryTradeAccountId) ?? mine[0];
    return primary && primary.verification === "verified" ? accountRebate(primary.id, logs) : 0;
  }
  return mine.filter((a) => a.verification === "verified" && a.status === "active").reduce((s, a) => s + accountRebate(a.id, logs), 0);
}

/** Case-by-case admin override of the monthly lot requirement, falling back to the global Settings value. */
export function requiredLotsFor(member: Member, settings: Settings): number {
  return member.requiredLotsOverride ?? settings.requiredLots;
}

/** Lifetime lots/rebate across every trade log for a member — unlike
 *  memberLots/accountRebate (default: current month only), this has no
 *  date filter. Used by the customer-facing dashboard (wallet totals,
 *  leaderboard ranking), which cares about all-time standing rather than
 *  this month's qualification number. */
export function memberLifetimeStats(memberId: number, logs: TradeLog[]): { lots: number; rebate: number } {
  return logs.reduce(
    (acc, l) => (l.memberId === memberId ? { lots: acc.lots + l.lots, rebate: acc.rebate + l.rebate } : acc),
    { lots: 0, rebate: 0 }
  );
}

export type AccessLabel = "Active" | "Expiring Soon" | "Expired" | "Suspended" | "Pending" | "No Access";

export function memberIndicatorAccess(memberId: number, all: IndicatorAccess[]): IndicatorAccess[] {
  return all.filter((a) => a.memberId === memberId);
}

/** A member can hold access to more than one indicator (e.g. both BeSight
 *  ONE and BeSight Orca). Anywhere only a single summary record fits — the
 *  Members table, the Overview stats — this picks the one expiring
 *  furthest out as the member's "best" standing. The Indicator Access page
 *  itself lists every record individually instead of collapsing them. */
export function primaryIndicatorAccess(memberId: number, all: IndicatorAccess[]): IndicatorAccess | undefined {
  const mine = memberIndicatorAccess(memberId, all);
  if (!mine.length) return undefined;
  return [...mine].sort((a, b) => b.expiryDate.localeCompare(a.expiryDate))[0];
}

export function accessLabel(access: IndicatorAccess | undefined, settings: Settings): AccessLabel {
  if (!access) return "No Access";
  if (access.status === "suspended") return "Suspended";
  if (access.status === "pending") return "Pending";
  if (access.status === "expired") return "Expired";
  const days = daysUntil(access.expiryDate);
  if (days < 0) return "Expired";
  if (days <= settings.expiringSoonDays) return "Expiring Soon";
  return "Active";
}

export function accessBadgeClass(label: AccessLabel): string {
  switch (label) {
    case "Active": return "active";
    case "Expiring Soon": return "warning";
    case "Expired": return "expired";
    case "Suspended": return "suspended";
    case "Pending": return "pending";
    default: return "suspended";
  }
}

/** i18n key for an AccessLabel — use with t() instead of rendering the label
 *  string directly, so badge text follows the language switch. */
export function accessLabelKey(label: AccessLabel): string {
  switch (label) {
    case "Active": return "common.active";
    case "Expiring Soon": return "common.expiringSoon";
    case "Expired": return "common.expired";
    case "Suspended": return "common.suspended";
    case "Pending": return "common.pending";
    case "No Access": return "common.noAccess";
  }
}

/** i18n key for a VerificationStatus — use with t() instead of cap(). */
export function verificationLabelKey(v: VerificationStatus): string {
  switch (v) {
    case "verified": return "common.verified";
    case "pending": return "common.pending";
    case "not_found": return "common.notFound";
  }
}

/** i18n key for a TelegramStatus — use with t() instead of cap(). */
export function telegramStatusLabelKey(s: TelegramStatus): string {
  switch (s) {
    case "active": return "common.active";
    case "pending": return "common.pending";
    case "expired": return "common.expired";
    case "banned": return "common.banned";
  }
}

export type CustomerStage = "new" | "existing";

/** Customer lifecycle tag shown on the Members table — derived by default so
 *  it can't drift from the access/renewal data it's read from, but an admin
 *  can force it via Member.customerStageOverride when the auto-detected
 *  value doesn't fit a specific case:
 *   - "new": no indicator access has ever been granted, or has access but
 *     hasn't made it through a renewal cycle yet (still unproven)
 *   - "existing": has renewed at least once, i.e. proven they hit the lot
 *     requirement in a past qualification period */
export function customerStage(member: Member, indicatorAccess: IndicatorAccess[]): CustomerStage {
  if (member.customerStageOverride) return member.customerStageOverride;
  const mine = memberIndicatorAccess(member.id, indicatorAccess);
  if (mine.some((a) => a.lastRenewalDate)) return "existing";
  return "new";
}

export function customerStageBadgeClass(stage: CustomerStage): string {
  switch (stage) {
    case "new": return "suspended";
    case "existing": return "active";
  }
}

/** Deterministic stand-in for a broker's real Trade ID verification API — the
 *  same Trade ID always resolves the same way. A match returns "verified"; a
 *  miss returns "pending" (not a hard rejection) since the account may still
 *  turn up on a later check — an admin can also correct it manually via
 *  TradeAccountForm. */
export function simulateTradeIdVerification(tradeId: string): VerificationStatus {
  let h = 0;
  for (let i = 0; i < tradeId.length; i++) h = (h * 31 + tradeId.charCodeAt(i)) >>> 0;
  return h % 10 === 0 ? "pending" : "verified";
}

export const ACCOUNT_TYPES = ["Standard", "Raw Spread", "Ultra Low"];

/** Deterministic mock account type a passed Trade ID check "returns" — stands
 *  in for the account type field a real broker verification API would report. */
export function simulateAccountType(tradeId: string): string {
  let h = 0;
  for (let i = 0; i < tradeId.length; i++) h = (h * 31 + tradeId.charCodeAt(i)) >>> 0;
  return ACCOUNT_TYPES[Math.floor(h / 7) % ACCOUNT_TYPES.length];
}

export function verificationBadgeClass(v: VerificationStatus): string {
  switch (v) {
    case "verified": return "active";
    case "pending": return "pending";
    case "not_found": return "expired";
  }
}

export function telegramBadgeClass(s: TelegramStatus): string {
  switch (s) {
    case "active": return "active";
    case "pending": return "pending";
    case "expired": return "expired";
    case "banned": return "banned";
  }
}

export function qualification(lots: number, required: number): "qualified" | "not_qualified" {
  return lots >= required ? "qualified" : "not_qualified";
}

export function progressTone(lots: number, required: number): "met" | "close" | "risk" {
  if (required <= 0 || lots >= required) return "met";
  if (lots >= required * 0.7) return "close";
  return "risk";
}
