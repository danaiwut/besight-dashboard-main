"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../crm/LanguageContext";
import { apiCall } from "../../lib/crmApi";
import { POPULAR_SYMBOLS, TIMEFRAMES, buildSymbolUniverse, type CandlesResponse, type TimeframeKey } from "../../lib/market";
import Icon from "../Icon";

const REFRESH_MS = 20_000;

function Sparkline({ candles, width = 220, height = 56 }: { candles: { t: number; c: number }[]; width?: number; height?: number }) {
  if (candles.length < 2) return null;
  const values = candles.map((row) => row.c);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const up = values[values.length - 1] >= values[0];
  const points = candles
    .map((row, i) => `${((i / (candles.length - 1)) * width).toFixed(1)},${(height - 4 - ((row.c - min) / span) * (height - 8)).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height }} aria-hidden="true">
      <polyline points={points} fill="none" stroke={up ? "var(--green)" : "var(--red)"} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Symbol search dropdown + timeframe pills + live price. Emits the live
 *  price into the trade form's Open/Close fields on demand (never writes
 *  by itself). */
export default function SymbolPricePicker({
  symbol,
  onSymbolChange,
  onUsePrice,
  brokerSymbols,
}: {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  onUsePrice: (price: number, field: "open" | "close") => void;
  brokerSymbols: string[];
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState(symbol);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [timeframe, setTimeframe] = useState<TimeframeKey>("15m");
  const [quote, setQuote] = useState<CandlesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const universe = useMemo(() => buildSymbolUniverse(brokerSymbols), [brokerSymbols]);
  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return universe.slice(0, 8);
    const starts = universe.filter((s) => s.startsWith(q));
    const contains = universe.filter((s) => !s.startsWith(q) && s.includes(q));
    return [...starts, ...contains].slice(0, 8);
  }, [query, universe]);

  // Keep the search box in sync when the parent sets a value (e.g. editing).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adopt external value only when the box isn't focused
    setQuery((cur) => (document.activeElement?.tagName === "INPUT" ? cur : symbol));
  }, [symbol]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const activeSymbol = symbol.trim().toUpperCase();

  useEffect(() => {
    if (!activeSymbol) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to the empty state when the symbol is cleared
      setQuote(null);
      setError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiCall<CandlesResponse & { ok: boolean }>(
      `/api/market/candles/?symbol=${encodeURIComponent(activeSymbol)}&interval=${timeframe}`,
      "GET",
    )
      .then((payload) => {
        if (cancelled) return;
        setQuote(payload);
        setError("");
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setQuote(null);
        setError(fetchError instanceof Error ? fetchError.message : t("dash.journal.price.unavailable"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const timer = window.setInterval(() => {
      apiCall<CandlesResponse & { ok: boolean }>(
        `/api/market/candles/?symbol=${encodeURIComponent(activeSymbol)}&interval=${timeframe}`,
        "GET",
      )
        .then((payload) => {
          if (!cancelled) {
            setQuote(payload);
            setError("");
          }
        })
        .catch(() => undefined);
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol, timeframe]);

  function commit(value: string) {
    onSymbolChange(value.trim().toUpperCase());
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(matches[highlight] ?? query);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const popular = universe.filter((s) => POPULAR_SYMBOLS.includes(s)).slice(0, 6);

  return (
    <div>
      <div ref={boxRef} style={{ position: "relative" }}>
        <input
          className="input mono"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value.toUpperCase());
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            if (query.trim().toUpperCase() !== activeSymbol) commit(query);
          }}
          onKeyDown={onKeyDown}
          placeholder={t("dash.journal.price.symbolPlaceholder")}
          role="combobox"
          aria-expanded={open}
          aria-controls="symbol-price-listbox"
          aria-label={t("dash.journal.col.symbol")}
          autoComplete="off"
        />
        {open && (
          <div
            id="symbol-price-listbox"
            style={{
              position: "absolute", zIndex: 30, top: "calc(100% + 4px)", left: 0, right: 0,
              background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10,
              boxShadow: "var(--shadow-pop)", maxHeight: 240, overflowY: "auto", padding: 4,
            }}
            role="listbox"
          >
            {!query.trim() && popular.length > 0 && (
              <div style={{ fontSize: 11, color: "var(--text-sub)", padding: "6px 10px 2px" }}>
                {t("dash.journal.price.popular")}
              </div>
            )}
            {matches.length ? (
              matches.map((item, i) => (
                <button
                  key={item}
                  type="button"
                  role="option"
                  aria-selected={i === highlight}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(item);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className="mono"
                  style={{
                    display: "flex", width: "100%", textAlign: "left", padding: "8px 10px",
                    borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13,
                    background: i === highlight ? "var(--bg-card2)" : "transparent", color: "var(--text)",
                  }}
                >
                  {item}
                </button>
              ))
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--text-sub)", padding: "8px 10px" }}>
                {t("dash.journal.price.custom", { symbol: query.trim().toUpperCase() })}
              </div>
            )}
          </div>
        )}
      </div>

      {activeSymbol && (
        <div style={{ marginTop: 8, padding: 10, border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-card2)" }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.key}
                type="button"
                onClick={() => setTimeframe(tf.key)}
                style={{
                  padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                  border: "1px solid var(--border)",
                  background: timeframe === tf.key ? "var(--blue)" : "transparent",
                  color: timeframe === tf.key ? "#fff" : "var(--text-sub)",
                }}
              >
                {tf.key}
              </button>
            ))}
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-sub)", alignSelf: "center" }}>
              {t("dash.journal.price.live")}
              <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "var(--green)", marginLeft: 5 }} />
            </span>
          </div>

          {loading && !quote ? (
            <div style={{ fontSize: 12.5, color: "var(--text-sub)" }}>…</div>
          ) : error || !quote ? (
            <div style={{ fontSize: 12.5, color: "var(--red)" }}>{error || t("dash.journal.price.unavailable")}</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span className="mono" style={{ fontSize: 20, fontWeight: 800 }}>
                  {quote.price.toLocaleString("en-US", { maximumFractionDigits: 5 })}
                </span>
                <span className="mono" style={{ fontSize: 12, color: quote.changePct >= 0 ? "var(--green)" : "var(--red)" }}>
                  {quote.changePct >= 0 ? "+" : ""}{quote.changePct.toFixed(2)}%
                </span>
                {loading && <Icon name="progress_activity" style={{ fontSize: 14, color: "var(--text-sub)" }} />}
              </div>
              <div style={{ marginTop: 4 }}>
                <Sparkline candles={quote.candles} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUsePrice(quote.price, "open")}>
                  {t("dash.journal.price.useOpen")}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUsePrice(quote.price, "close")}>
                  {t("dash.journal.price.useClose")}
                </button>
                <span style={{ fontSize: 10.5, color: "var(--text-sub)", marginLeft: "auto" }}>
                  {new Date(quote.asOf).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
