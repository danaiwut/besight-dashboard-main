import { VerificationStatus } from "@/generated/prisma/client";
import { fetchAccountLotCheck } from "./lotCheck";

/* Shared Trade ID verification against the lot-check webhook. Used by the
   admin verify endpoint and by a member adding their own trade account, so
   both paths agree on what "verified" means. */

export const TRADE_LOOKBACK_MONTHS = 12;

export type TradeVerification = {
  verification: VerificationStatus;
  hasTrades: boolean;
  totalLots: number;
  /** Human-readable Thai summary, ready to show in the result modal. */
  message: string;
};

/** Wide lookback so "has this Trade ID ever traded?" is answered generously;
 *  the webhook returns an empty body (a real zero, not an error) on no match. */
export async function verifyTradeId(tradeId: string): Promise<TradeVerification> {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - TRADE_LOOKBACK_MONTHS, now.getUTCDate()));
  const data = await fetchAccountLotCheck(from.toISOString().slice(0, 10), now.toISOString().slice(0, 10), tradeId);
  const hasTrades = data.account.length > 0;
  return {
    verification: hasTrades ? VerificationStatus.verified : VerificationStatus.pending,
    hasTrades,
    totalLots: data.totalLots,
    message: hasTrades
      ? `พบการเทรด ${data.totalLots.toFixed(2)} lots ในช่วง ${TRADE_LOOKBACK_MONTHS} เดือนที่ผ่านมา`
      : `ไม่พบการเทรดในช่วง ${TRADE_LOOKBACK_MONTHS} เดือนที่ผ่านมา — จะตรวจอีกครั้งเมื่อมีการเทรด`,
  };
}
