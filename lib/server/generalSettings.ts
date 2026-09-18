import { getPrisma } from "./prisma";

/** General CRM settings (Telegram + display windows + lot calculation mode).
 *  Lives in its own module so server code (cron, snapshots) can read it
 *  without importing anything from a route file. */

export type GeneralSettings = {
  telegramBotToken: string;
  telegramPrivateRoomId: string;
  telegramAutoRemove: boolean;
  expiringSoonDays: number;
  /** "sum_all_active" counts EVERY active trade account regardless of
   *  verification. The legacy stored value "sum_all_verified" is accepted and
   *  treated identically (see normalizeGeneralSettings). */
  lotCalculationMode: "sum_all_active" | "selected_only";
};

export const GENERAL_SETTINGS_KEY = "crm_general";

export function defaultGeneralSettings(): GeneralSettings {
  return {
    telegramBotToken: "",
    telegramPrivateRoomId: "",
    telegramAutoRemove: true,
    expiringSoonDays: 7,
    lotCalculationMode: "sum_all_active",
  };
}

export function normalizeGeneralSettings(value: unknown): GeneralSettings {
  const defaults = defaultGeneralSettings();
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const expiring = Number(input.expiringSoonDays);
  return {
    telegramBotToken: typeof input.telegramBotToken === "string" ? input.telegramBotToken : defaults.telegramBotToken,
    telegramPrivateRoomId: typeof input.telegramPrivateRoomId === "string" ? input.telegramPrivateRoomId : defaults.telegramPrivateRoomId,
    telegramAutoRemove: typeof input.telegramAutoRemove === "boolean" ? input.telegramAutoRemove : defaults.telegramAutoRemove,
    expiringSoonDays: Number.isFinite(expiring) && expiring >= 1 ? Math.floor(expiring) : defaults.expiringSoonDays,
    // Legacy stored value "sum_all_verified" counts the same as "sum_all_active".
    lotCalculationMode: input.lotCalculationMode === "selected_only" ? "selected_only" : "sum_all_active",
  };
}

export async function readGeneralSettings(): Promise<GeneralSettings> {
  const record = await getPrisma().systemSetting.findUnique({ where: { key: GENERAL_SETTINGS_KEY } });
  if (!record) return defaultGeneralSettings();
  try {
    return normalizeGeneralSettings(JSON.parse(record.valueJson));
  } catch {
    return defaultGeneralSettings();
  }
}
