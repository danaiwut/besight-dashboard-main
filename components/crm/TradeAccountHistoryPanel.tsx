"use client";

import { useEffect, useState } from "react";
import { type TradeLog, type DateRange, fmtDate, lot } from "./CrmContext";
import { useLanguage } from "./LanguageContext";
import SummaryTotalBar from "./SummaryTotalBar";

const HISTORY_ROW_HEIGHT = 38.5;

type ExcludedSymbolRow = { instrument: string; lots: number };

export default function TradeAccountHistoryPanel({ accountId, tradeId, range }: { accountId: number; tradeId: string; range: DateRange }) {
  const { t } = useLanguage();
  const [dailyRows, setDailyRows] = useState<TradeLog[]>([]);
  const [periodTotal, setPeriodTotal] = useState<number | null>(null);
  const [pairs, setPairs] = useState<ExcludedSymbolRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Reset to the loading state before refetching.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDailyRows([]);
    fetch(`/api/crm/trade-logs/?tradeAccountId=${accountId}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; tradeLogs?: TradeLog[] };
        if (!cancelled && response.ok && payload.ok && payload.tradeLogs) setDailyRows(payload.tradeLogs);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [accountId]);

  // Same real webhook + same date range as the Trade Accounts total above, so
  // this panel's total always matches it exactly — one source of truth, not two.
  useEffect(() => {
    let cancelled = false;
    // Reset to the loading state before refetching.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPeriodTotal(null);
    setPairs([]);
    const url = `/api/crm/lot-check/?date_from=${range.from}&date_to=${range.to}&tradeid=${encodeURIComponent(tradeId)}`;
    fetch(url, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as {
          ok?: boolean;
          data?: { totalLots?: number; excludedSymbols?: Array<{ loginId: string; instrument: string; lots: number }> };
        };
        if (cancelled || !response.ok || !payload.ok) return;
        setPeriodTotal(payload.data?.totalLots ?? 0);
        const mine = (payload.data?.excludedSymbols || []).filter((row) => row.loginId === tradeId);
        const bySymbol = new Map<string, number>();
        mine.forEach((row) => bySymbol.set(row.instrument, (bySymbol.get(row.instrument) ?? 0) + row.lots));
        setPairs(Array.from(bySymbol, ([instrument, lots]) => ({ instrument, lots })).sort((a, b) => b.lots - a.lots));
      })
      .catch(() => { if (!cancelled) setPeriodTotal(0); });
    return () => { cancelled = true; };
  }, [tradeId, range.from, range.to]);

  const rows = dailyRows
    .filter((l) => (!range.from || l.tradeDate >= range.from) && (!range.to || l.tradeDate <= range.to))
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));

  return (
    <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <label style={{ margin: 0 }}>{t("ta.history.title")}</label>
        <span style={{ fontSize: 12, color: "var(--text-sub)" }}>
          {fmtDate(range.from)} – {fmtDate(range.to)}
        </span>
      </div>
      <SummaryTotalBar label={t("ta.history.total")} lots={periodTotal ?? 0} rebate={0} style={{ margin: "0 0 14px" }} />

      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-sub)", display: "block", marginBottom: 6 }}>{t("ta.symbols.title")}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
        {pairs.length ? (
          pairs.map(({ instrument, lots }) => (
            <span
              key={instrument}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 600,
                background: "var(--bg-card2)",
                border: "1px solid var(--border)",
              }}
            >
              {instrument}
              <span style={{ color: "var(--text-sub)", fontWeight: 500 }}>{lot(lots)} Lots</span>
            </span>
          ))
        ) : (
          <span style={{ fontSize: 12.5, color: "var(--text-sub)" }}>{t("ta.symbols.none")}</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-sub)", marginBottom: 14 }}>{t("ta.symbols.note")}</div>

      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-sub)", display: "block", marginBottom: 6 }}>{t("ta.daily.title")}</label>
      <div
        style={{
          maxHeight: rows.length > 5 ? 5 * HISTORY_ROW_HEIGHT : undefined,
          overflowY: rows.length > 5 ? "auto" : "visible",
          border: "1px solid var(--border)",
          borderRadius: 10,
        }}
      >
        {(rows.length ? rows : [null]).map((l, i) => (
          <div
            key={l ? l.id : "empty"}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "9px 12px",
              borderBottom: i === (rows.length ? rows.length - 1 : 0) ? "none" : "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: 12.5, color: "var(--text-sub)" }}>{l ? fmtDate(l.tradeDate) : t("ta.daily.empty")}</span>
            <span style={{ fontSize: 13 }}>{l ? `${lot(l.lots)} Lots` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
