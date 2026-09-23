import type { Prisma, BecRate, SpinPrize, SpinResult } from "@/generated/prisma/client";
import { DEFAULT_BEC_RATES } from "../becRates";
import { DEFAULT_SPIN_SETTINGS, type BecRateDto, type SpinPageData, type SpinPrizeDto, type SpinResultDto, type SpinSettings } from "../spin";
import { getPrisma } from "./prisma";

/* ── BEC points & Spin & Win ──
   BEC is earned from REAL traded lots (TradeLog) converted by a per-symbol
   rate, and spent on spins. Nothing is ever written back to the trade logs,
   member lot totals, rebates, or indicator access — the balance is computed as
   "earned from trades − spent on spins", so the CRM is untouched by design. */

type Db = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

export class SpinError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SpinError";
    this.code = code;
  }
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/* ── Settings ── */

export function normalizeSpinSettings(value: unknown): SpinSettings {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const number = (v: unknown, fallback: number, min: number) => {
    const parsed = Number(v);
    return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
  };
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : DEFAULT_SPIN_SETTINGS.enabled,
    costPerSpin: number(input.costPerSpin, DEFAULT_SPIN_SETTINGS.costPerSpin, 0),
    defaultPointsPerLot: number(input.defaultPointsPerLot, DEFAULT_SPIN_SETTINGS.defaultPointsPerLot, 0),
    minWithdraw: number(input.minWithdraw, DEFAULT_SPIN_SETTINGS.minWithdraw, 0),
  };
}

export async function readSpinSettings(): Promise<SpinSettings> {
  const record = await getPrisma().systemSetting.findUnique({ where: { key: "spin" } });
  if (!record) return DEFAULT_SPIN_SETTINGS;
  try {
    return normalizeSpinSettings(JSON.parse(record.valueJson));
  } catch {
    return DEFAULT_SPIN_SETTINGS;
  }
}

export async function saveSpinSettings(value: unknown): Promise<SpinSettings> {
  const settings = normalizeSpinSettings(value);
  await getPrisma().systemSetting.upsert({
    where: { key: "spin" },
    update: { valueJson: JSON.stringify(settings) },
    create: { key: "spin", valueJson: JSON.stringify(settings), description: "BEC points & Spin & Win settings." },
  });
  return settings;
}

/* ── DTOs ── */

/** Parses the shared prize fields, rejecting nonsense before it reaches the DB. */
export function parseSpinPrizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new Error("Prize name is required");
    data.name = name;
  }
  if (body.icon !== undefined) data.icon = String(body.icon).trim() || "redeem";
  if (body.image !== undefined) {
    const image = String(body.image).trim() || null;
    // Data-URL uploads (file picker) can be large — cap ~1.5MB so a prize row
    // never blows up the response payload or the DB TEXT column.
    if (image && image.length > 1_500_000) throw new Error("Image is too large (max ~1MB)");
    data.image = image;
  }
  if (body.valueNote !== undefined) data.valueNote = String(body.valueNote).trim() || null;
  if (body.weight !== undefined) {
    const weight = Math.floor(Number(body.weight));
    if (!Number.isFinite(weight) || weight < 1) throw new Error("Weight must be at least 1");
    data.weight = weight;
  } else if (body.percent !== undefined) {
    // Lets the admin UI submit a 0-100% drop rate directly; converted to the
    // relative weight scale (x10) the picker uses. 0% is rejected — use the
    // active toggle to disable a prize instead.
    const percent = Number(body.percent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) throw new Error("Percent must be 0-100");
    data.weight = Math.max(1, Math.round(percent * 10));
  }
  if (body.stock !== undefined) {
    if (body.stock === null || body.stock === "") data.stock = null;
    else {
      const stock = Math.floor(Number(body.stock));
      if (!Number.isFinite(stock) || stock < 0) throw new Error("Stock must be 0 or more");
      data.stock = stock;
    }
  }
  if (body.sortOrder !== undefined) data.sortOrder = Math.floor(Number(body.sortOrder) || 0);
  if (body.active !== undefined) data.active = Boolean(body.active);
  return data;
}

export function toBecRateDto(row: BecRate): BecRateDto {
  return { id: row.id, symbol: row.symbol, pointsPerLot: row.pointsPerLot.toNumber(), active: row.active };
}

export function toSpinPrizeDto(row: SpinPrize): SpinPrizeDto {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    image: row.image || undefined,
    weight: row.weight,
    stock: row.stock,
    valueNote: row.valueNote || undefined,
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

export function toSpinResultDto(
  row: SpinResult & { prize: SpinPrize; member: { code: string; name: string; displayName: string | null } },
): SpinResultDto {
  return {
    id: row.id,
    prizeId: row.prizeId,
    prizeName: row.prize.name,
    prizeIcon: row.prize.icon,
    prizeImage: row.prize.image || undefined,
    cost: row.cost.toNumber(),
    status: row.status,
    spunAt: row.spunAt.toISOString(),
    memberId: row.memberId,
    memberName: row.member.displayName?.trim() || row.member.name,
    memberCode: row.member.code,
    note: row.note || undefined,
  };
}

/* ── BEC balance ── */

/** Symbol → BEC per lot. DB rows override the built-in table (which comes from
 *  the loyalty sheet); missing symbols fall back to the settings default. */
export async function becRateMap(settings: SpinSettings) {
  const rows = await getPrisma().becRate.findMany();
  const map = new Map<string, number>();
  for (const [symbol, points] of DEFAULT_BEC_RATES) map.set(symbol.toUpperCase(), points);
  for (const row of rows) map.set(row.symbol.toUpperCase(), row.pointsPerLot.toNumber());
  return { map, fallback: settings.defaultPointsPerLot };
}

/** Points earned from every real trade log, summed per symbol so a 237-symbol
 *  rate table costs one grouped query per member instead of one per trade. */
export async function becEarned(memberId: number, db: Db = getPrisma()): Promise<number> {
  const settings = await readSpinSettings();
  const { map, fallback } = await becRateMap(settings);
  const [grouped, grants] = await Promise.all([
    db.tradeLog.groupBy({ by: ["symbol"], where: { memberId }, _sum: { lots: true } }),
    db.becGrant.aggregate({ where: { memberId }, _sum: { points: true } }),
  ]);
  const fromLogs = grouped.reduce((sum, row) => {
    const lots = row._sum.lots?.toNumber() ?? 0;
    const rate = map.get(row.symbol.trim().toUpperCase()) ?? fallback;
    return sum + lots * rate;
  }, 0);
  // Grants are points already earned by logs that have since been pruned — they
  // keep the balance permanent instead of letting it shrink with history.
  return round(fromLogs + (grants._sum.points?.toNumber() ?? 0), 4);
}

/** Points spent on spins — cancelled spins refund automatically. */
export async function becSpent(memberId: number, db: Db = getPrisma()): Promise<number> {
  const result = await db.spinResult.aggregate({
    where: { memberId, status: { not: "cancelled" } },
    _sum: { cost: true },
  });
  return round(result._sum.cost?.toNumber() ?? 0, 4);
}

export async function becBalance(memberId: number, db: Db = getPrisma()) {
  const [earned, spent] = await Promise.all([becEarned(memberId, db), becSpent(memberId, db)]);
  return { earned, spent, balance: round(earned - spent, 4) };
}

/* ── Spin ── */

function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((sum, item) => sum + Math.max(1, item.weight), 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= Math.max(1, item.weight);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

export async function spinPageData(memberId: number): Promise<SpinPageData> {
  const prisma = getPrisma();
  const [settings, prizes, history, balance] = await Promise.all([
    readSpinSettings(),
    prisma.spinPrize.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.spinResult.findMany({
      where: { memberId },
      orderBy: { spunAt: "desc" },
      take: 12,
      include: { prize: true, member: { select: { code: true, name: true, displayName: true } } },
    }),
    becBalance(memberId),
  ]);
  return {
    settings,
    ...balance,
    spinsAvailable: settings.costPerSpin > 0 ? Math.floor(balance.balance / settings.costPerSpin) : 0,
    prizes: prizes.map(toSpinPrizeDto),
    history: history.map(toSpinResultDto),
  };
}

export type SpinOutcome = {
  prize: SpinPrizeDto;
  cost: number;
  balance: number;
  spinsAvailable: number;
};

/** Awards one prize and records the spend. The member row is locked for the
 *  duration so two concurrent requests can't both spend the last points. */
export async function performSpin(memberId: number): Promise<SpinOutcome> {
  const prisma = getPrisma();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe("SELECT id FROM `Member` WHERE id = ? FOR UPDATE", memberId);

    const settings = await readSpinSettings();
    if (!settings.enabled) throw new SpinError("spin_disabled", "กิจกรรมหมุนยังไม่เปิดให้บริการ");
    if (settings.costPerSpin <= 0) throw new SpinError("spin_disabled", "ยังไม่ได้ตั้งค่าคะแนนต่อการหมุน");

    const balance = await becBalance(memberId, tx);
    if (balance.balance < settings.costPerSpin) {
      throw new SpinError("insufficient_bec", "คะแนน BEC ไม่เพียงพอสำหรับการหมุน");
    }

    const prizes = await tx.spinPrize.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    const pool = prizes.filter((prize) => prize.stock === null || prize.stock > 0);
    if (!pool.length) throw new SpinError("no_prizes", "ยังไม่มีรางวัลในวงล้อ");

    const prize = pickWeighted(pool.map((row) => ({ ...row, weight: row.weight })));
    if (prize.stock !== null) {
      await tx.spinPrize.update({ where: { id: prize.id }, data: { stock: { decrement: 1 } } });
    }
    // Re-read the row so the DTO reflects the decremented stock.
    const fresh = await tx.spinPrize.findUniqueOrThrow({ where: { id: prize.id } });

    await tx.spinResult.create({
      data: { memberId, prizeId: prize.id, cost: settings.costPerSpin, status: "pending", spunAt: new Date() },
    });

    const balanceAfter = round(balance.balance - settings.costPerSpin, 4);
    return { prize: fresh, balance: balanceAfter, cost: settings.costPerSpin };
  });

  return {
    prize: toSpinPrizeDto(result.prize),
    cost: result.cost,
    balance: result.balance,
    spinsAvailable: result.cost > 0 ? Math.floor(result.balance / result.cost) : 0,
  };
}
