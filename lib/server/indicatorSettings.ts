import { getPrisma } from "./prisma";

export type IndicatorAutomationSettings = {
  requiredLots: number;
  renewalMonths: number;
  enabled: boolean;
};

function positiveNumber(value: unknown, fallback: number, minimum = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

export function defaultIndicatorAutomationSettings(): IndicatorAutomationSettings {
  return {
    requiredLots: positiveNumber(process.env.DEFAULT_REQUIRED_LOTS, 3),
    renewalMonths: Math.max(1, Math.floor(positiveNumber(process.env.INDICATOR_RENEWAL_MONTHS, 1, 1))),
    enabled: true,
  };
}

export function normalizeIndicatorAutomationSettings(value: unknown): IndicatorAutomationSettings {
  const defaults = defaultIndicatorAutomationSettings();
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    requiredLots: positiveNumber(input.requiredLots, defaults.requiredLots),
    renewalMonths: Math.max(1, Math.floor(positiveNumber(input.renewalMonths, defaults.renewalMonths, 1))),
    enabled: typeof input.enabled === "boolean" ? input.enabled : defaults.enabled,
  };
}

export async function readIndicatorAutomationSettings() {
  const record = await getPrisma().systemSetting.findUnique({ where: { key: "indicator_automation" } });
  if (!record) return defaultIndicatorAutomationSettings();
  try {
    return normalizeIndicatorAutomationSettings(JSON.parse(record.valueJson));
  } catch {
    return defaultIndicatorAutomationSettings();
  }
}

export async function saveIndicatorAutomationSettings(value: unknown) {
  const settings = normalizeIndicatorAutomationSettings(value);
  await getPrisma().systemSetting.upsert({
    where: { key: "indicator_automation" },
    update: { valueJson: JSON.stringify(settings) },
    create: {
      key: "indicator_automation",
      valueJson: JSON.stringify(settings),
      description: "Defaults for automatic Indicator access after lot qualification.",
    },
  });
  return settings;
}
