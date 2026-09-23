"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { currentLotCycle } from "../../lib/lotCycle";
import { apiCall } from "../../lib/crmApi";
import { formatDay, getDateLang } from "../../lib/dateLocale";

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
  /** CRM-only: another account row carries the same Trade ID (upstream data
   *  can duplicate one account across members). */
  duplicateTradeId?: boolean;
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
  origin?: string;
  note?: string;
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
  discordUserId?: string;
  lineUserId?: string;
  lineDisplayName?: string;
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
  /** Real lots for the member's current entitlement period, from the CRM lot-check webhook —
   *  persisted by the member-lots-snapshot cron so list views don't need a live call per row.
   *  Only valid for the stamped from/to window (a later sync can move the
   *  member's qualification dates — see memberLots()). */
  currentPeriodLots?: number;
  currentPeriodLotsAt?: string;
  currentPeriodLotsFrom?: string;
  currentPeriodLotsTo?: string;
};

export type Admin = { id: number; name: string; email: string; role: string; owner?: boolean };

/** Account types an admin can assign to a trade account. The upstream CRM
 *  payload carries no account type yet (see Phase 2 of the plan), so this is
 *  chosen manually rather than guessed. */
export const ACCOUNT_TYPES = ["Standard", "Raw Spread", "Ultra Low"];

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

export type LotCalculationMode = "sum_all_active" | "selected_only";

/** Server-computed lot summary per member (snapshot-only, current cycle window).
 *  Hydrated with the members payload so list/detail read one number instead of
 *  recomputing ledger math per row. Absent in demo mode — callers fall back to
 *  the local memberLots() math. */
export type LotSummary = {
  lots: number;
  required: number;
  qualified: boolean;
  stale: boolean;
  from: string;
  to: string;
  asOf?: string;
};

export type LotOverview = { requiredLots: number; qualified: number; notQualified: number };

export type Settings = {
  requiredLots: number;
  renewalPeriodMonths: number;
  expiringSoonDays: number;
  autoRenewalEnabled: boolean;
  lotCalculationMode: LotCalculationMode;
  telegramBotToken: string;
  telegramPrivateRoomId: string;
  telegramAutoRemove: boolean;
  /** Public invite links shown on the VIP page after linking. */
  telegramInviteLink: string;
  discordInviteLink: string;
  lineInviteLink: string;
  /** Which indicator IDs each plan entitles a member to — drives auto-grant
   *  on top of (never instead of) manual Grant/Suspend/Revoke, so admins
   *  keep full override control per member. */
  planEntitlements: Record<Plan, number[]>;
};

const DEFAULT_SETTINGS: Settings = {
  requiredLots: 3.0,
  renewalPeriodMonths: 1,
  expiringSoonDays: 7,
  autoRenewalEnabled: true,
  lotCalculationMode: "sum_all_active",
  telegramBotToken: "",
  telegramPrivateRoomId: "",
  telegramAutoRemove: true,
  telegramInviteLink: "",
  discordInviteLink: "",
  lineInviteLink: "",
  planEntitlements: { free: [2, 3], ib_partner: [1, 2] },
};

type CrmContextValue = {
  members: Member[];
  setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
  tradeAccounts: TradeAccount[];
  setTradeAccounts: React.Dispatch<React.SetStateAction<TradeAccount[]>>;
  /** CRM-synced accounts the member hasn't confirmed yet (member dashboard only). */
  pendingTradeAccounts: TradeAccount[];
  setPendingTradeAccounts: React.Dispatch<React.SetStateAction<TradeAccount[]>>;
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
  /** Server-computed lot summaries keyed by member id (snapshot-only, current
   *  cycle). Empty in demo mode — pages fall back to local ledger math. */
  lotSummaries: Record<number, LotSummary>;
  lotOverview: LotOverview | null;
  toast: (msg: string) => void;
  toastMsg: string;
  toastShow: boolean;
  /** `actor` is accepted for call-site compatibility but ignored — the signed-in
   *  identity is used instead, both locally and on the server. */
  log: (entry: Omit<ActivityLog, "id" | "timestamp" | "actor"> & { actor?: string }) => void;
  syncPlanAccess: (memberId: number, plan: Plan, memberName: string) => Promise<number>;
  memberSyncStatus: "idle" | "loading" | "live" | "error";
  memberSyncError: string;
  refreshMembers: () => Promise<void>;
  /** "loading" until every initial backend read has settled (success or
   *  failure) — pages render skeletons while this is "loading". */
  crmDataStatus: "loading" | "ready";
  /** Non-empty when one or more backend reads failed. The affected collections
   *  are empty rather than seeded, so pages must surface this instead of
   *  rendering as if there were genuinely no records. */
  crmDataError: string;
  /** True when the access gate rejected the reads — the session ended, so the
   *  only useful action is signing in again. */
  gateRequired: boolean;
  /** Last seen realtime counter (see ADR-001) — detail views refetch their
   *  own slices when this moves. */
  dataVersion: number;
  /** True once any backend read has succeeded — mutations persist via API;
   *  false means pure demo mode (mutations stay local). */
  backendLive: boolean;
  /** Re-read every dataset from DB-read endpoints (no upstream sync). */
  reloadFromDatabase: () => Promise<void>;
  /** The signed-in account, passed from the server layout. */
  viewer: { name: string; email: string; role: "admin" | "member" };
  /** Member dashboard: the TradingView username + email that matched the CRM
   *  record, once the member has verified their identity. Required before a
   *  trade account can be claimed. */
  identity: { tradingView: string; email: string } | null;
  verifyIdentity: (tradingView: string, email: string) => Promise<{ ok: boolean; error?: string }>;
};

const CrmContext = createContext<CrmContextValue | null>(null);

/* Module-level: when the last successful upstream sync finished. Mounts
   within SYNC_COOLDOWN_MS reuse current DB state instead of firing another
   ~9s replace-sync (freshness still comes from the 10s version poll, the
   15min customer-sync cron, and the manual Re-sync button, which always forces). */
let lastSyncFinishedAt = 0;
const SYNC_COOLDOWN_MS = 60_000;
/* Background auto-sync: re-runs the upstream replace-sync every 5min while an
   admin tab is visible and the cooldown has elapsed, so the member list does
   not go stale during long sessions without manual refresh. */
const AUTO_SYNC_INTERVAL_MS = 5 * 60_000;

/* A failed read and an empty table must never look alike: returning null for both
   is what let a 401 silently repaint the UI with seed data. Callers get an
   explicit outcome instead. */
type LoadResult<T> = { ok: true; data: T } | { ok: false; error: string; gateRequired: boolean };

async function loadJson<T>(url: string): Promise<LoadResult<T & { ok?: boolean }>> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as T & { ok?: boolean; error?: string; code?: string };
    if (!response.ok || !payload.ok) {
      return {
        ok: false,
        error: payload.error || `${url} failed (${response.status})`,
        gateRequired: response.status === 401,
      };
    }
    return { ok: true, data: payload };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : `${url} failed`, gateRequired: false };
  }
}

/* One fetch per backend dataset — DB reads only, never the slow upstream
   Supabase sync. Shared by initial load and the realtime reload path. */
type DatabasePayloads = {
  members?: { members?: Member[]; tradeAccounts?: TradeAccount[]; pendingTradeAccounts?: TradeAccount[]; lotSummaries?: Record<number, LotSummary>; lotOverview?: LotOverview } | null;
  brokers?: { brokers?: Broker[] } | null;
  indicators?: { indicators?: Indicator[]; indicatorAccess?: IndicatorAccess[]; planEntitlements?: Record<Plan, number[]> } | null;
  activity?: { activityLogs?: ActivityLog[] } | null;
  telegram?: { telegramAccess?: TelegramAccess[] } | null;
  admins?: { admins?: Admin[] } | null;
  tradeLogs?: { tradeLogs?: TradeLog[] } | null;
  automation?: { requiredLots?: number; renewalMonths?: number; enabled?: boolean } | null;
  general?: { telegramBotToken?: string; telegramPrivateRoomId?: string; telegramAutoRemove?: boolean; expiringSoonDays?: number; lotCalculationMode?: LotCalculationMode | "sum_all_verified"; telegramInviteLink?: string; discordInviteLink?: string; lineInviteLink?: string } | null;
  renewals?: { renewalHistory?: RenewalRecord[] } | null;
  version?: { version?: number } | null;
  /** Member dashboard only: set once the member has passed the identity check,
   *  so the verify card stays hidden on later visits. */
  identity?: { tradingView: string; email: string } | null;
};

type HydrationOutcome = { payloads: DatabasePayloads; failures: string[]; gateRequired: boolean };

async function fetchDatabasePayloads(): Promise<HydrationOutcome> {
  const [members, brokers, indicators, activity, telegram, admins, tradeLogs, automation, general, version] = await Promise.all([
    loadJson<{ members?: Member[]; tradeAccounts?: TradeAccount[]; lotSummaries?: Record<number, LotSummary>; lotOverview?: LotOverview }>("/api/crm/members/"),
    loadJson<{ brokers?: Broker[] }>("/api/crm/brokers/"),
    loadJson<{ indicators?: Indicator[]; indicatorAccess?: IndicatorAccess[]; planEntitlements?: Record<Plan, number[]> }>("/api/crm/indicators/"),
    loadJson<{ activityLogs?: ActivityLog[] }>("/api/crm/activity-logs/?limit=2000"),
    loadJson<{ telegramAccess?: TelegramAccess[] }>("/api/crm/telegram-access/"),
    loadJson<{ admins?: Admin[] }>("/api/crm/admins/"),
    loadJson<{ tradeLogs?: TradeLog[] }>("/api/crm/trade-logs/"),
    loadJson<{ settings?: { requiredLots?: number; renewalMonths?: number; enabled?: boolean } }>("/api/crm/settings/indicator-automation/"),
    loadJson<{ settings?: DatabasePayloads["general"] }>("/api/crm/settings/general/"),
    loadJson<{ version?: number }>("/api/crm/version/"),
  ]);
  const results = { members, brokers, indicators, activity, telegram, admins, tradeLogs, automation, general, version };
  const failures = Object.entries(results).filter(([, r]) => !r.ok).map(([name]) => name);
  const gateRequired = Object.values(results).some((r) => !r.ok && r.gateRequired);
  const value = <T,>(result: LoadResult<T>) => (result.ok ? result.data : undefined);

  return {
    payloads: {
      members: value(members),
      brokers: value(brokers),
      indicators: value(indicators),
      activity: value(activity),
      telegram: value(telegram),
      admins: value(admins),
      tradeLogs: value(tradeLogs),
      automation: value(automation)?.settings,
      general: value(general)?.settings ?? undefined,
      version: value(version),
    },
    failures,
    gateRequired,
  };
}

/* Member dashboard payload — one request scoped to the signed-in member. */
async function fetchMemberPayloads(): Promise<HydrationOutcome> {
  const result = await loadJson<{
    member?: Member;
    tradeAccounts?: TradeAccount[];
    pendingTradeAccounts?: TradeAccount[];
    tradeLogs?: TradeLog[];
    indicatorAccess?: IndicatorAccess[];
    telegramAccess?: TelegramAccess[];
    renewalHistory?: RenewalRecord[];
    indicators?: Indicator[];
    planEntitlements?: Record<Plan, number[]>;
    brokers?: Broker[];
    identity?: { tradingView: string; email: string } | null;
    settings?: { requiredLots?: number; renewalPeriodMonths?: number; autoRenewalEnabled?: boolean };
  }>("/api/me/");
  if (!result.ok) return { payloads: {}, failures: ["me"], gateRequired: result.gateRequired };
  const d = result.data;
  return {
    payloads: {
      members: d.member ? { members: [d.member], tradeAccounts: d.tradeAccounts, pendingTradeAccounts: d.pendingTradeAccounts } : undefined,
      brokers: d.brokers ? { brokers: d.brokers } : undefined,
      indicators: d.indicators ? { indicators: d.indicators, indicatorAccess: d.indicatorAccess, planEntitlements: d.planEntitlements } : undefined,
      telegram: d.telegramAccess ? { telegramAccess: d.telegramAccess } : undefined,
      tradeLogs: d.tradeLogs ? { tradeLogs: d.tradeLogs } : undefined,
      renewals: d.renewalHistory ? { renewalHistory: d.renewalHistory } : undefined,
      identity: d.identity ?? null,
      automation: d.settings,
    },
    failures: [],
    gateRequired: false,
  };
}

export function CrmProvider({ children, mode = "admin", viewer }: { children: ReactNode; mode?: "admin" | "member"; viewer?: { name: string; email: string; role: "admin" | "member" } }) {
  /* Empty until the database answers. Seeding these with sample rows is what
     allowed a failed read to render as plausible-looking content. */
  const [members, setMembers] = useState<Member[]>([]);
  const [tradeAccounts, setTradeAccounts] = useState<TradeAccount[]>([]);
  const [pendingTradeAccounts, setPendingTradeAccounts] = useState<TradeAccount[]>([]);
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [indicatorAccess, setIndicatorAccess] = useState<IndicatorAccess[]>([]);
  const [telegramAccess, setTelegramAccess] = useState<TelegramAccess[]>([]);
  const [renewalHistory, setRenewalHistory] = useState<RenewalRecord[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [lotSummaries, setLotSummaries] = useState<Record<number, LotSummary>>({});
  const [lotOverview, setLotOverview] = useState<LotOverview | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const [toastShow, setToastShow] = useState(false);
  const [memberSyncStatus, setMemberSyncStatus] = useState<"idle" | "loading" | "live" | "error">("idle");
  const [memberSyncError, setMemberSyncError] = useState("");
  const [crmDataStatus, setCrmDataStatus] = useState<"loading" | "ready">("loading");
  const [crmDataError, setCrmDataError] = useState("");
  const [gateRequired, setGateRequired] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [backendLive, setBackendLive] = useState(false);
  const [identity, setIdentity] = useState<{ tradingView: string; email: string } | null>(null);

  const verifyIdentity = useCallback(async (tradingView: string, email: string) => {
    try {
      await apiCall("/api/me/verify-identity/", "POST", { tradingView, email });
      setIdentity({ tradingView, email });
      return { ok: true };
    } catch (error) {
      setIdentity(null);
      return { ok: false, error: error instanceof Error ? error.message : "ยืนยันตัวตนไม่สำเร็จ" };
    }
  }, []);

  /* Applies one full set of backend payloads to state. The database always wins,
     including when it legitimately returns nothing — an empty table must render
     as empty, never as leftover seed data. Sources that FAILED are absent from
     the payload and are reported separately as an error, so a 401 or an outage
     can no longer masquerade as real content. */
  const applyHydration = useCallback((p: DatabasePayloads) => {
    if (Object.values(p).some((v) => v !== null && v !== undefined)) setBackendLive(true);
  if (p.members?.members) setMembers(p.members.members);
  if (p.members?.tradeAccounts) setTradeAccounts(p.members.tradeAccounts);
  if (p.members?.pendingTradeAccounts) setPendingTradeAccounts(p.members.pendingTradeAccounts);
  if (p.members?.lotSummaries) setLotSummaries(p.members.lotSummaries);
  if (p.members?.lotOverview) setLotOverview(p.members.lotOverview);
    if (p.brokers?.brokers) setBrokers(p.brokers.brokers);
    if (p.admins?.admins) setAdmins(p.admins.admins);
    if (p.telegram?.telegramAccess) setTelegramAccess(p.telegram.telegramAccess);
    if (p.indicators) {
      if (p.indicators.indicators) setIndicators(p.indicators.indicators);
      if (p.indicators.indicatorAccess) setIndicatorAccess(p.indicators.indicatorAccess);
      if (p.indicators.planEntitlements) {
        const entitlements = p.indicators.planEntitlements;
        setSettings((current) => ({ ...current, planEntitlements: entitlements }));
      }
    }
    if (p.activity?.activityLogs) setActivityLogs(p.activity.activityLogs);
    if (p.tradeLogs?.tradeLogs) setTradeLogs(p.tradeLogs.tradeLogs);
    if (p.renewals?.renewalHistory) setRenewalHistory(p.renewals.renewalHistory);
    // Member dashboard: a remembered verification keeps the verify card hidden.
    if (p.identity !== undefined) setIdentity(p.identity);
    if (p.automation) {
      const automation = p.automation;
      setSettings((current) => ({
        ...current,
        ...(typeof automation.requiredLots === "number" ? { requiredLots: automation.requiredLots } : {}),
        ...(typeof automation.renewalMonths === "number" ? { renewalPeriodMonths: automation.renewalMonths } : {}),
        ...(typeof automation.enabled === "boolean" ? { autoRenewalEnabled: automation.enabled } : {}),
      }));
    }
    if (p.general) {
      const general = p.general;
      setSettings((current) => ({
        ...current,
        ...(typeof general.telegramBotToken === "string" ? { telegramBotToken: general.telegramBotToken } : {}),
        ...(typeof general.telegramPrivateRoomId === "string" ? { telegramPrivateRoomId: general.telegramPrivateRoomId } : {}),
        ...(typeof general.telegramAutoRemove === "boolean" ? { telegramAutoRemove: general.telegramAutoRemove } : {}),
        ...(typeof general.telegramInviteLink === "string" ? { telegramInviteLink: general.telegramInviteLink } : {}),
        ...(typeof general.discordInviteLink === "string" ? { discordInviteLink: general.discordInviteLink } : {}),
        ...(typeof general.lineInviteLink === "string" ? { lineInviteLink: general.lineInviteLink } : {}),
        ...(typeof general.expiringSoonDays === "number" ? { expiringSoonDays: general.expiringSoonDays } : {}),
        // Legacy stored value "sum_all_verified" counts the same as "sum_all_active".
        ...(general.lotCalculationMode === "selected_only" || general.lotCalculationMode === "sum_all_active" || general.lotCalculationMode === "sum_all_verified"
          ? { lotCalculationMode: general.lotCalculationMode === "selected_only" ? "selected_only" as const : "sum_all_active" as const }
          : {}),
      }));
    }
    if (typeof p.version?.version === "number") setDataVersion(p.version.version);
  }, []);

  /* Re-read every dataset from DB-read endpoints (no upstream sync) — the
     realtime reload path. Server wins; ephemeral local-only rows (e.g. the
     rebate-backfill estimator, which deliberately never persists) are dropped.
     Overlapping reloads are skipped — every reload reads full state, so a
     skipped one loses nothing. */
  const reloadInFlight = useRef(false);
  /* Once the gate rejects us there is nothing to retry until the user signs in
     again — without this latch the 10s poller and the sync retry keep firing
     against a 401 forever, which floods the log and exhausts the browser's
     connection pool (it starved the gate page's own sign-in request). */
  const gateBlocked = useRef(false);
  const reloadFromDatabase = useCallback(async () => {
    if (reloadInFlight.current || gateBlocked.current) return;
    reloadInFlight.current = true;
    try {
      const { payloads, failures, gateRequired } = mode === "member"
        ? await fetchMemberPayloads()
        : await fetchDatabasePayloads();
      if (gateRequired) gateBlocked.current = true;
      applyHydration(payloads);
      setGateRequired(gateRequired);
      setCrmDataError(failures.length ? `โหลดข้อมูลไม่สำเร็จ: ${failures.join(", ")}` : "");
    } finally {
      reloadInFlight.current = false;
    }
  }, [applyHydration, mode]);

  const refreshMembers = useCallback(async () => {
    if (gateBlocked.current) return;
    setMemberSyncStatus("loading");
    setMemberSyncError("");
    try {
      const response = await fetch("/api/crm/customers/sync/", { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; error?: string; members?: Member[]; tradeAccounts?: TradeAccount[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || `Customer sync failed (${response.status})`);
      if (payload.members?.length) setMembers(payload.members);
      if (payload.tradeAccounts) setTradeAccounts(payload.tradeAccounts);
      setMemberSyncStatus("live");
      lastSyncFinishedAt = Date.now();
      // The sync also wrote indicator/telegram rows — read everything back.
      await reloadFromDatabase();
    } catch (error) {
      setMemberSyncStatus("error");
      setMemberSyncError(error instanceof Error ? error.message : "Customer sync failed");
    }
  }, [reloadFromDatabase]);

  /* ── Initial backend hydration ──
     DB reads first (fast, parallel — typically well under a second), so pages
     leave skeleton state almost immediately; the slow upstream replace-sync
     (~9s+: Supabase pagination + hundreds of upserts + lot recomputes) then
     runs in the background with progress surfaced by the members sync banner,
     merging fresh rows in when it arrives. */
  useEffect(() => {
    let cancelled = false;
    async function initialLoad() {
      await reloadFromDatabase();
      if (cancelled) return;
      setCrmDataStatus("ready");
      // Admin only: the member dashboard has no upstream sync.
      if (mode === "admin" && Date.now() - lastSyncFinishedAt > SYNC_COOLDOWN_MS) void refreshMembers();
    }
    const timer = window.setTimeout(() => void initialLoad(), 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [refreshMembers, reloadFromDatabase, mode]);

  /* ── Realtime refresh (see ADR-001) ──
     Poll the version counter every 10s (skipped while the tab is hidden) and
     on tab focus; any move means new data from some writer (UI, sync, cron) —
     reload all datasets. Starts only after the initial load settles. */
  const lastSeenVersion = useRef(-1);
  useEffect(() => {
    // Admin-only: the version counter lives behind /api/crm (member sessions
    // must not read it). The member dashboard reloads on focus instead.
    if (mode !== "admin") return;
    if (crmDataStatus !== "ready" || gateRequired) return;
    let cancelled = false;
    async function checkVersion() {
      if (document.hidden) return;
      const result = await loadJson<{ version?: number }>("/api/crm/version/");
      if (cancelled) return;
      if (!result.ok) {
        // A gate rejection mid-session must surface, not fail silently in a poll.
        if (result.gateRequired) setGateRequired(true);
        return;
      }
      const version = result.data.version;
      if (typeof version !== "number") return;
      if (lastSeenVersion.current === -1) {
        lastSeenVersion.current = version;
        setDataVersion(version);
        return;
      }
      if (version !== lastSeenVersion.current) {
        lastSeenVersion.current = version;
        setDataVersion(version);
        await reloadFromDatabase();
      }
    }
    void checkVersion();
    const timer = window.setInterval(() => void checkVersion(), 10_000);
    const onVisibility = () => { if (!document.hidden) void checkVersion(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [crmDataStatus, gateRequired, reloadFromDatabase, mode]);

  /* Member dashboards have no version counter to poll — reload on focus so a
     background sync or cron is reflected without a manual refresh. */
  useEffect(() => {
    if (mode !== "member") return;
    const onVisibility = () => { if (!document.hidden) void reloadFromDatabase(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [mode, reloadFromDatabase]);

  /* ── Background upstream auto-sync (admin only) ──
     The 10s version poll only re-reads the DB; without this the Supabase
     upstream replace-sync runs once per mount and the member list goes stale
     during long sessions. Every 5min (visible tab only, cooldown-respecting)
     re-run the upstream sync so fresh customers flow in automatically. */
  useEffect(() => {
    if (mode !== "admin") return;
    if (crmDataStatus !== "ready" || gateRequired) return;
    const timer = window.setInterval(() => {
      if (document.hidden || gateBlocked.current) return;
      if (Date.now() - lastSyncFinishedAt <= SYNC_COOLDOWN_MS) return;
      // Skip if a reload is already in flight; refreshMembers re-reads after.
      if (reloadInFlight.current) return;
      void refreshMembers();
    }, AUTO_SYNC_INTERVAL_MS);
    const onVisibility = () => {
      if (document.hidden || gateBlocked.current) return;
      if (Date.now() - lastSyncFinishedAt > AUTO_SYNC_INTERVAL_MS) void refreshMembers();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [mode, crmDataStatus, gateRequired, refreshMembers]);

  function toast(msg: string) {
    setToastMsg(msg);
    setToastShow(true);
    setTimeout(() => setToastShow(false), 1800);
  }

  /* `actor` is ignored if a caller passes one: the server stamps the row from
     the session, so the optimistic row here uses the same signed-in identity
     rather than a name the caller chose. */
  function log(entry: Omit<ActivityLog, "id" | "timestamp" | "actor"> & { actor?: string }) {
    const { actor: _ignored, ...rest } = entry;
    const actor = viewer?.name?.trim() || viewer?.email?.trim() || "—";
    setActivityLogs((cur) => [
      { id: Math.max(0, ...cur.map((l) => l.id)) + 1, timestamp: new Date().toISOString(), actor, ...rest },
      ...cur,
    ]);
    void fetch("/api/crm/activity-logs/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rest),
    }).catch(() => undefined);
  }

  /* Plan → indicator entitlement is additive only: it fills in access the
     member's plan entitles them to but doesn't already have ANY record for
     (active, suspended, or even expired/revoked — a past manual revoke is
     never silently re-granted). It never removes access, so a manual grant
     that goes beyond the plan (e.g. Special Access on a Free member) or a
     manual restriction always wins — Manage stays the source of truth for
     anything the plan didn't set up. Grants persist via the API when the
     backend is live, else locally (demo mode). Returns how many grants it
     created. */
  async function syncPlanAccess(memberId: number, plan: Plan, memberName: string): Promise<number> {
    const entitledIds = settings.planEntitlements[plan] ?? [];
    const entitled = indicators.filter((i) => entitledIds.includes(i.id) && i.status === "active");
    const mine = indicatorAccess.filter((a) => a.memberId === memberId);
    const missing = entitled.filter((i) => !mine.some((a) => a.indicator === i.name));
    if (!missing.length) return 0;

    const today = new Date().toISOString().slice(0, 10);
    const expiry = addMonths(today, settings.renewalPeriodMonths);
    const granted: IndicatorAccess[] = [];
    if (backendLive) {
      for (const indicator of missing) {
        try {
          const payload = await apiCall<{ indicatorAccess: IndicatorAccess }>("/api/crm/indicator-access/", "POST", {
            memberId, indicatorId: indicator.id, status: "active", source: "Plan", startsAt: today, expiresAt: expiry,
          });
          granted.push(payload.indicatorAccess);
        } catch (error) {
          toast(error instanceof Error ? error.message : "Unable to grant indicator access");
          break;
        }
      }
    } else {
      let nextId = Math.max(0, ...indicatorAccess.map((a) => a.id));
      for (const indicator of missing) {
        granted.push({
          id: ++nextId,
          memberId,
          indicator: indicator.name,
          status: "active",
          source: "Plan",
          startDate: today,
          expiryDate: expiry,
        });
      }
    }
    if (granted.length) {
      setIndicatorAccess((cur) => [...granted, ...cur]);
      for (const access of granted) {
        log({ actor: "System", memberId, memberName, action: "Indicator Granted", description: `${access.indicator} auto-granted from the ${PLAN_LABELS[plan]} plan, expires ${access.expiryDate}.` });
      }
    }
    return granted.length;
  }

  return (
    <CrmContext.Provider
      value={{
        members, setMembers,
        tradeAccounts, setTradeAccounts,
        pendingTradeAccounts, setPendingTradeAccounts,
        tradeLogs, setTradeLogs,
        brokers, setBrokers,
        indicators, setIndicators,
        indicatorAccess, setIndicatorAccess,
        telegramAccess, setTelegramAccess,
        renewalHistory, setRenewalHistory,
        activityLogs, setActivityLogs,
        admins, setAdmins,
        settings, setSettings,
        lotSummaries, lotOverview,
        toast, toastMsg, toastShow,
        log, syncPlanAccess,
        memberSyncStatus, memberSyncError, refreshMembers,
        crmDataStatus, crmDataError, gateRequired, dataVersion, backendLive, reloadFromDatabase,
        viewer: viewer ?? { name: "", email: "", role: mode },
        identity, verifyIdentity,
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
/** Locale-aware date ("Sep 16, 2026" / "16 ก.ย. 2026") — follows the shared
 *  app language; English output is byte-identical to before. */
export const fmtDate = (d?: string) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (getDateLang() === "th") return formatDay(dt);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
/** Locale-aware timestamp — Thai uses 24h time + "น.", English unchanged. */
export const fmtDateTime = (d: string) => {
  const dt = new Date(d);
  if (getDateLang() === "th") {
    return `${formatDay(dt)}, ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")} น.`;
  }
  return dt.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};
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
export function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = toLocalISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return { from, to };
}

/** The member's CURRENT monthly lot cycle: anchored on the access start day
 *  (started Feb 10 → Feb 10–Mar 10, then Mar 10–Apr 10, …). Falls back to the
 *  calendar month for members with no CRM entitlement dates. */
export function memberLotRange(member: Member): { from: string; to: string } {
  return currentLotCycle({ crmStartDate: member.crmStartDate, crmExpiryDate: member.crmExpiryDate }) ?? currentMonthRange();
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

/** Respects Settings.lotCalculationMode — sums EVERY active account regardless
 *  of verification, or only the member's designated primary account
 *  (`selected_only`). Verification answers "has this account ever traded?"
 *  (per account); qualification counts everything registered (per member).
 *  Prefers the real, persisted `currentPeriodLots` (from the CRM lot-check
 *  webhook via the member-lots-snapshot cron) — but ONLY when its stamped
 *  window matches the member's current qualification window. A later sync can
 *  move crmStartDate/crmExpiryDate, which would otherwise leave a
 *  stale-window number on screen (the list/detail mismatch). On a window
 *  miss it falls back to the ledger math over the current window, which is
 *  window-correct by construction. */
export function memberLots(member: Member, accounts: TradeAccount[], logs: TradeLog[], settings: Settings, range?: DateRange): number {
  const window = range?.from && range?.to ? { from: range.from, to: range.to } : memberLotRange(member);
  if (
    member.currentPeriodLots !== undefined &&
    member.currentPeriodLotsFrom === window.from &&
    member.currentPeriodLotsTo === window.to
  ) {
    return member.currentPeriodLots;
  }
  const mine = memberTradeAccounts(member.id, accounts);
  const windowRange = { from: window.from, to: window.to };
  if (settings.lotCalculationMode === "selected_only") {
    const primary = mine.find((a) => a.id === member.primaryTradeAccountId) ?? mine[0];
    return primary && primary.status === "active" ? accountLots(primary.id, logs, windowRange) : 0;
  }
  return mine.filter((a) => a.status === "active").reduce((s, a) => s + accountLots(a.id, logs, windowRange), 0);
}

/** Same shape as memberLots, but sums accountRebate instead — this month's
 *  rebate rather than this month's lots. Used by the customer dashboard's
 *  "This Month's Rebate" stat. */
export function memberRebate(member: Member, accounts: TradeAccount[], logs: TradeLog[], settings: Settings, range?: DateRange): number {
  const mine = memberTradeAccounts(member.id, accounts);
  if (settings.lotCalculationMode === "selected_only") {
    const primary = mine.find((a) => a.id === member.primaryTradeAccountId) ?? mine[0];
    return primary && primary.status === "active" ? accountRebate(primary.id, logs, range) : 0;
  }
  return mine.filter((a) => a.status === "active").reduce((s, a) => s + accountRebate(a.id, logs, range), 0);
}

/** Case-by-case admin override of the lot requirement, falling back to the
 *  global Settings value. The requirement is a flat lot count for the member's
 *  whole qualification window — a longer entitlement period does not raise it
 *  (3 lots stays 3 lots); use the per-member override in the CRM to differ. */
export function requiredLotsFor(member: Member, settings: Settings): number {
  return member.requiredLotsOverride ?? settings.requiredLots;
}

/** Live lots for one account, straight from the CRM lot-check webhook (the
 *  same source the renewal engine qualifies members against) — no mock/backfilled
 *  trade-log data involved. */
export async function fetchRealAccountLots(tradeId: string, range: DateRange): Promise<number> {
  const from = range.from || currentMonthRange().from;
  const to = range.to || currentMonthRange().to;
  const url = `/api/crm/lot-check/?date_from=${from}&date_to=${to}&tradeid=${encodeURIComponent(tradeId)}`;
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json() as { ok?: boolean; data?: { totalLots?: number } };
  if (!response.ok || !payload.ok) throw new Error("Unable to load real lots");
  return payload.data?.totalLots || 0;
}

/** Hook mirroring memberLots' shape (respects lotCalculationMode), but sourced
 *  live from the real CRM webhook instead of any local/mock trade-log array —
 *  so what an admin sees here always matches what actually qualifies a member
 *  for renewal. Returns null while the real total is still loading. */
export function useRealMemberLots(member: Member | undefined, accounts: TradeAccount[], settings: Settings, range: DateRange): number | null {
  const [lots, setLots] = useState<number | null>(null);
  const mine = member ? memberTradeAccounts(member.id, accounts) : [];
  const targets = member && settings.lotCalculationMode === "selected_only"
    ? [mine.find((a) => a.id === member.primaryTradeAccountId) ?? mine[0]].filter((a): a is TradeAccount => Boolean(a) && a!.status === "active")
    : mine.filter((a) => a.status === "active");
  const tradeIds = targets.map((a) => a.tradeId).join(",");

  useEffect(() => {
    let cancelled = false;
    // Reset to the loading state ("…" in the UI) before refetching.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLots(null);
    if (!tradeIds) {
      setLots(0);
      return;
    }
    Promise.all(tradeIds.split(",").map((tradeId) => fetchRealAccountLots(tradeId, range)))
      .then((values) => { if (!cancelled) setLots(values.reduce((s, v) => s + v, 0)); })
      .catch(() => { if (!cancelled) setLots(0); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeIds, range.from, range.to]);

  return lots;
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
