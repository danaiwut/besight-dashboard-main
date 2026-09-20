"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "../crm/LanguageContext";
import { apiCall } from "../../lib/crmApi";
import { contractSizeOf, normalizeBrokerSymbol, profitCurrencyOf } from "../../lib/market";
import type { JournalTrade } from "../../lib/journal";
import Icon from "../Icon";

const REFRESH_MS = 20_000;

type Quote = { price?: number; error?: string };

function fmtMoney(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

/** Live watch for still-open trades: current market price per symbol (one
 *  batched round-trip, auto-refresh), price distance and an estimated
 *  floating P&L. The $ figure is an estimate from standard contract sizes —
 *  labelled as such — and only shows for USD-settled symbols. */
export default function JournalLivePositions({ trades }: { trades: JournalTrade[] }) {
  const { t } = useLanguage();
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [asOf, setAsOf] = useState<string | null>(null);

  const symbols = useMemo(
    () => [...new Set(trades.map((trade) => normalizeBrokerSymbol(trade.symbol)).filter(Boolean))],
    [trades],
  );
  const symbolsKey = symbols.join(",");

  const load = useCallback(async () => {
    if (!symbols.length) return;
    try {
      const payload = await apiCall<{ quotes: Record<string, { price?: number; error?: string }> }>(
        `/api/market/candles/?symbols=${symbols.map(encodeURIComponent).join(",")}&interval=1m`,
        "GET",
      );
      const next: Record<string, Quote> = {};
      for (const [key, value] of Object.entries(payload.quotes)) {
        next[normalizeBrokerSymbol(key)] = typeof value.price === "number" ? { price: value.price } : { error: value.error };
      }
      setQuotes(next);
      setAsOf(new Date().toISOString());
    } catch {
      // keeps the last quotes; the row shows a dash instead
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  if (!trades.length) return null;

  const rows = trades.map((trade) => {
    const base = normalizeBrokerSymbol(trade.symbol);
    const quote = quotes[base];
    const live = quote?.price;
    const distance = live != null ? (live - trade.openPrice) * (trade.side === "buy" ? 1 : -1) : null;
    const size = contractSizeOf(base);
    const currency = profitCurrencyOf(base);
    const floating = live != null && size != null && currency === "USD" && distance != null
      ? distance * trade.lots * size
      : null;
    return { trade, live, distance, floating };
  });
  const totalFloating = rows.every((row) => row.floating != null)
    ? rows.reduce((sum, row) => sum + (row.floating ?? 0), 0)
    : null;

  return (
    <div className="card" style={{ padding: 20, marginTop: 20 }}>
      <div className="panel-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />
        {t("dash.journal.live.title")}
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-sub)", fontWeight: 400 }}>
          {asOf
            ? new Date(asOf).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
            : "…"}
          <button type="button" className="kebab" aria-label={t("dash.journal.live.refresh")} title={t("dash.journal.live.refresh")} onClick={() => void load()}>
            <Icon name="sync" />
          </button>
        </span>
      </div>

      <div className="table-wrap">
        <table className="data" style={{ minWidth: 620 }}>
          <thead>
            <tr>
              <th>{t("dash.journal.col.symbol")}</th>
              <th>{t("dash.journal.col.type")}</th>
              <th>{t("dash.journal.col.open")}</th>
              <th>{t("dash.journal.live.price")}</th>
              <th>{t("dash.journal.live.floating")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ trade, live, distance, floating }) => (
              <tr key={trade.id}>
                <td>
                  {trade.symbol}
                  <span style={{ color: "var(--text-sub)", fontSize: 11.5, marginLeft: 6 }}>· {trade.lots.toFixed(2)}</span>
                </td>
                <td className={trade.side === "buy" ? "journal-side-buy" : "journal-side-sell"}>
                  {trade.side === "buy" ? t("dash.journal.buy") : t("dash.journal.sell")}
                </td>
                <td className="mono">{trade.openPrice.toFixed(2)}</td>
                <td className="mono">
                  {live != null ? (
                    <>
                      {live.toLocaleString("en-US", { maximumFractionDigits: 5 })}
                      {distance != null && (
                        <span style={{ marginLeft: 6, fontSize: 11.5, color: distance >= 0 ? "var(--green)" : "var(--red)" }}>
                          {distance >= 0 ? "+" : ""}{distance.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={{ color: "var(--text-sub)" }}>—</span>
                  )}
                </td>
                <td className="mono" style={{ color: (floating ?? 0) >= 0 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                  {floating != null ? (
                    <>{fmtMoney(floating)}<span style={{ fontWeight: 400, fontSize: 10.5, color: "var(--text-sub)" }}> ~</span></>
                  ) : (
                    <span style={{ color: "var(--text-sub)", fontWeight: 400 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 11.5, color: "var(--text-sub)" }}>{t("dash.journal.live.estimateNote")}</span>
        {totalFloating != null && (
          <span style={{ fontSize: 14, fontWeight: 800, color: totalFloating >= 0 ? "var(--green)" : "var(--red)" }}>
            {t("dash.journal.live.total")} {fmtMoney(totalFloating)}<span style={{ fontWeight: 400, fontSize: 11, color: "var(--text-sub)" }}> ~</span>
          </span>
        )}
      </div>
    </div>
  );
}
