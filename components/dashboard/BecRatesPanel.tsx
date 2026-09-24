"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "../crm/LanguageContext";
import { fmtDateTime, lot } from "../crm/CrmContext";
import { apiCall } from "../../lib/crmApi";
import Icon from "../Icon";

type RateRow = { symbol: string; pointsPerLot: number };

type BecRatesPayload = {
  rates: RateRow[];
  defaultPointsPerLot: number;
  costPerSpin: number;
  spinEnabled: boolean;
  earned: number;
  spent: number;
  balance: number;
  updatedAt: string | null;
};

const POLL_MS = 60_000;

/** BEC points table (points per lot by symbol) + the member's BEC balance.
 *  Shown in a dialog from the Benefits page; polls while open so an admin's
 *  rate change shows up. */
export default function BecRatesPanel() {
  const { t } = useLanguage();
  const [data, setData] = useState<BecRatesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [minPoints, setMinPoints] = useState<number | "all">("all");

  const load = useCallback(async () => {
    try {
      const payload = await apiCall<BecRatesPayload & { ok: boolean }>("/api/me/bec-rates/", "GET");
      setData(payload);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load BEC rates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Live table: load now, then poll so an admin's rate change shows up.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load; the async fetch sets state in its callback
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    const onVisibility = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  const rateSteps = useMemo(() => {
    if (!data) return [] as number[];
    return [...new Set(data.rates.map((row) => row.pointsPerLot))].sort((a, b) => b - a);
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.rates
      .filter((row) => minPoints === "all" || row.pointsPerLot === minPoints)
      .filter((row) => !q || row.symbol.toLowerCase().includes(q));
  }, [data, query, minPoints]);

  if (loading) {
    return (
      <p className="modal-detail" style={{ textAlign: "left", margin: 0 }}>…</p>
    );
  }

  if (error || !data) {
    return (
      <div>
        <p>{error || "—"}</p>
        <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => void load()}>
          {t("common.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="bec-rates-panel">
      <div className="bec-rates-main">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <div className="comp-tabs" style={{ flex: 1, marginBottom: 0 }}>
            <button type="button" className={`comp-tab${minPoints === "all" ? " is-active" : ""}`} onClick={() => setMinPoints("all")}>
              {t("dash.becRates.all")}
            </button>
            {rateSteps.map((points) => (
              <button key={points} type="button" className={`comp-tab${minPoints === points ? " is-active" : ""}`} onClick={() => setMinPoints(points)}>
                {points}
              </button>
            ))}
          </div>
          <div className="search" style={{ flex: "0 1 240px" }}>
            <Icon name="search" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("dash.becRates.search")} aria-label={t("dash.becRates.search")} />
          </div>
        </div>

        {data.updatedAt && (
          <div className="lbd-updated" style={{ marginBottom: 10 }}>
            <Icon name="update" />
            {t("dash.becRates.updatedAt", { when: fmtDateTime(data.updatedAt) })}
          </div>
        )}

        <div className="table-wrap">
          <table className="data" style={{ minWidth: 420 }}>
            <thead>
              <tr>
                <th>{t("dash.becRates.col.symbol")}</th>
                <th>{t("dash.becRates.col.points")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row.symbol}>
                    <td className="mono">{row.symbol}</td>
                    <td>
                      <span className="badge active">{row.pointsPerLot}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2}>
                    <div className="table-empty">{t("dash.becRates.empty")}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bec-rates-side">
        <div className="bec-rates-box">
          <div className="panel-section-title" style={{ marginBottom: 6 }}>
            {t("dash.becRates.balance")}
          </div>
          <div className="spin-stat-value">{lot(data.balance)}</div>
          <div className="spin-stat-note" style={{ marginTop: 4 }}>
            {t("dash.spin.earnedSpent", { earned: lot(data.earned), spent: lot(data.spent) })}
          </div>
          {data.spinEnabled && (
            <>
              <div className="drawer-row" style={{ marginTop: 12 }}>
                <span className="k">{t("dash.becRates.spinCost")}</span>
                <span className="v">{data.costPerSpin}</span>
              </div>
              <Link className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} href="/dashboard/spin-wheel">
                <Icon name="casino" />
                {t("dash.nav.spinWheel")}
              </Link>
            </>
          )}
        </div>

        <div className="bec-rates-box">
          <div className="panel-section-title" style={{ marginBottom: 6 }}>
            {t("dash.becRates.howTitle")}
          </div>
          <ul className="fs-bullets">
            <li>
              <Icon name="check_circle" />
              {t("dash.becRates.how1", { points: data.defaultPointsPerLot })}
            </li>
            <li>
              <Icon name="check_circle" />
              {t("dash.becRates.how2")}
            </li>
            <li>
              <Icon name="check_circle" />
              {t("dash.becRates.how3")}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
