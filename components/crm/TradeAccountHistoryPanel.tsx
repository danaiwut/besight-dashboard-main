"use client";

import { useState } from "react";
import { useCrm, fmtDate, lot } from "./CrmContext";
import { useLanguage } from "./LanguageContext";
import SummaryTotalBar from "./SummaryTotalBar";

const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString("en-US", { month: "short" }));
const HISTORY_ROW_HEIGHT = 38.5;

export default function TradeAccountHistoryPanel({ accountId }: { accountId: number }) {
  const { tradeLogs } = useCrm();
  const { t } = useLanguage();
  const currentDate = new Date();
  const [historyYear, setHistoryYear] = useState(currentDate.getFullYear());
  const [historyMonth, setHistoryMonth] = useState(currentDate.getMonth() + 1);

  const allRows = tradeLogs.filter((l) => l.tradeAccountId === accountId);
  const selectedKey = `${historyYear}-${String(historyMonth).padStart(2, "0")}`;
  const rows = allRows.filter((l) => l.tradeDate.slice(0, 7) === selectedKey).sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
  const monthLots = rows.reduce((s, l) => s + l.lots, 0);
  const monthRebate = rows.reduce((s, l) => s + l.rebate, 0);
  const bySymbol = new Map<string, number>();
  rows.forEach((l) => bySymbol.set(l.symbol, (bySymbol.get(l.symbol) ?? 0) + l.lots));
  const symbolRows = Array.from(bySymbol.entries()).sort((a, b) => b[1] - a[1]);
  const yearsAvailable = Array.from(new Set([...allRows.map((l) => Number(l.tradeDate.slice(0, 4))), currentDate.getFullYear()])).sort((a, b) => b - a);

  return (
    <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <label style={{ margin: 0 }}>{t("ta.history.title")}</label>
        <div style={{ display: "flex", gap: 6 }}>
          <select className="filter-select" aria-label={t("ta.history.month")} value={historyMonth} onChange={(e) => setHistoryMonth(Number(e.target.value))}>
            {MONTH_LABELS.map((label, i) => (
              <option key={label} value={i + 1}>
                {label}
              </option>
            ))}
          </select>
          <select className="filter-select" aria-label={t("ta.history.year")} value={historyYear} onChange={(e) => setHistoryYear(Number(e.target.value))}>
            {yearsAvailable.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
      <SummaryTotalBar label={t("ta.history.total")} lots={monthLots} rebate={monthRebate} style={{ margin: "0 0 14px" }} />

      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-sub)", display: "block", marginBottom: 6 }}>{t("ta.symbols.title")}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {(symbolRows.length ? symbolRows : ([["—", 0]] as [string, number][])).map(([symbol, lots]) => (
          <span
            key={symbol}
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
            {symbol}
            <span style={{ color: "var(--text-sub)", fontWeight: 500 }}>{lot(lots)} Lots</span>
          </span>
        ))}
      </div>

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
            <span style={{ fontSize: 12.5, color: "var(--text-sub)" }}>{l ? fmtDate(l.tradeDate) : "—"}</span>
            <span style={{ fontSize: 13 }}>{lot(l ? l.lots : 0)} Lots</span>
            <span style={{ fontSize: 13, color: "var(--green)" }}>${(l ? l.rebate : 0).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
