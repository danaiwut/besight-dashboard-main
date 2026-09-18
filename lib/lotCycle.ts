/** Backward-compatible re-export — the canonical implementation lives in
 *  `lib/lotEngine.ts`. Existing imports keep working unchanged. */
export {
  addMonthsIso,
  currentLotCycle,
  currentMonthIso,
  lotWindowForPeriod,
  resolveLotWindow,
  snapshotMatchesWindow,
  dedupeTradeIds,
  qualify,
  normalizeCountMode,
  selectAccountsToCount,
  type LotCycle,
  type LotPeriod,
  type LotWindow,
  type LotCountMode,
  type CountableAccount,
} from "./lotEngine";
