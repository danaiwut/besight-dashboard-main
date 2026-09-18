/** Shared types + defaults for the BEC points & Spin & Win feature. Import-safe
 *  on both client and server (no Prisma import). */

export type SpinStatus = "pending" | "fulfilled" | "cancelled";

export type SpinSettings = {
  enabled: boolean;
  /** BEC points spent per spin. */
  costPerSpin: number;
  /** Fallback rate for symbols without their own BecRate row. */
  defaultPointsPerLot: number;
  /** Minimum cash value before a reward can be withdrawn (display only for now). */
  minWithdraw: number;
};

export const DEFAULT_SPIN_SETTINGS: SpinSettings = {
  enabled: true,
  costPerSpin: 10,
  defaultPointsPerLot: 1,
  minWithdraw: 15,
};

export type BecRateDto = {
  id: number;
  symbol: string;
  pointsPerLot: number;
  active: boolean;
};

export type SpinPrizeDto = {
  id: number;
  name: string;
  icon: string;
  image?: string;
  weight: number;
  /** null = unlimited. */
  stock: number | null;
  valueNote?: string;
  active: boolean;
  sortOrder: number;
};

export type SpinResultDto = {
  id: number;
  prizeId: number;
  prizeName: string;
  prizeIcon: string;
  prizeImage?: string;
  cost: number;
  status: SpinStatus;
  /** ISO timestamp. */
  spunAt: string;
  memberId: number;
  memberName: string;
  memberCode: string;
  note?: string;
};

/** Everything the customer spin page needs in one read. */
export type SpinPageData = {
  settings: SpinSettings;
  earned: number;
  spent: number;
  balance: number;
  spinsAvailable: number;
  prizes: SpinPrizeDto[];
  history: SpinResultDto[];
};
