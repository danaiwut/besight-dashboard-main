"use client";

import { useState } from "react";
import { useCrm } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import Icon from "../../../components/Icon";
import DateRangePicker, { type DateRange } from "../../../components/crm/DateRangePicker";
import { exportCsv } from "../../../lib/exportCsv";
import { WORLD_COUNTRIES } from "../../../lib/countries";
import { MONTHS_LONG, formatDay, getDateLang } from "../../../lib/dateLocale";
import { CampaignsSkeleton } from "../../../components/crm/Skeletons";

const CAMPAIGNS = ["Summer Bonus 2026", "New Year Cashback", "Refer a Friend", "Zero Spread Week", "IB Growth Challenge"];
const INSTRUMENTS = ["Forex", "Metals", "Indices", "Crypto", "CFDs"];

const TIME_FRAMES = ["today", "yesterday", "last7", "last30", "thisMonth", "lastMonth", "compareMonths"] as const;
type TimeFrame = (typeof TIME_FRAMES)[number];
const DETAIL_LEVELS = ["day", "week", "month"] as const;
type DetailLevel = (typeof DETAIL_LEVELS)[number];

type ReportRow = {
  period: string;
  clicks: number;
  subClicks: number;
  realAccounts: number;
  appRegs: number;
  profiles: number;
  appProfiles: number;
  nda: number;
  ncr: number;
  undc: number;
  tncr: number;
  vtncr: number;
  tndc: number;
  conversion: number;
  apcRate: number;
  activeTraders: number;
  lots: number;
  lotRebate: number;
  subCommission: number;
  adjustment: number;
  totalCommission: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function isoDay(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fmtDayLabel(d: Date) {
  return formatDay(d);
}

function dateRangeFor(timeFrame: TimeFrame): { start: Date; end: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (timeFrame) {
    case "yesterday": {
      const d = addDays(today, -1);
      return { start: d, end: d };
    }
    case "last7":
      return { start: addDays(today, -6), end: today };
    case "last30":
      return { start: addDays(today, -29), end: today };
    case "thisMonth":
      return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today };
    case "lastMonth": {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: s, end: e };
    }
    case "compareMonths":
      return { start: new Date(today.getFullYear(), today.getMonth() - 5, 1), end: today };
    default:
      return { start: today, end: today };
  }
}

function bucketsFor(timeFrame: TimeFrame, detail: DetailLevel): { key: string; label: string }[] {
  const { start, end } = dateRangeFor(timeFrame);
  const buckets: { key: string; label: string }[] = [];
  if (detail === "day") {
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      buckets.push({ key: isoDay(d), label: fmtDayLabel(d) });
    }
  } else if (detail === "week") {
    for (let d = new Date(start); d <= end; d = addDays(d, 7)) {
      const weekEnd = new Date(Math.min(addDays(d, 6).getTime(), end.getTime()));
      buckets.push({ key: isoDay(d), label: `${fmtDayLabel(d)} – ${fmtDayLabel(weekEnd)}` });
    }
  } else {
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      buckets.push({ key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`, label: `${MONTHS_LONG[getDateLang()][d.getMonth()]} ${d.getFullYear()}` });
    }
  }
  return buckets;
}

/** Deterministic pseudo-random hash — same filters + period always produce the same
 *  mock numbers, so the report doesn't reshuffle itself on every re-render. */
function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

function generateRow(periodKey: string, periodLabel: string, campaign: string, instrument: string, country: string): ReportRow {
  const h = hash(`${periodKey}|${campaign}|${instrument}|${country}`);
  const bit = (shift: number, mod: number) => (h >>> shift) % mod;

  const clicks = 80 + bit(0, 420);
  const subClicks = Math.round(clicks * (0.1 + bit(3, 20) / 100));
  const realAccounts = Math.round(clicks * (0.15 + bit(5, 15) / 100));
  const appRegs = Math.round(realAccounts * (0.7 + bit(7, 25) / 100));
  const profiles = Math.round(appRegs * (0.8 + bit(9, 15) / 100));
  const appProfiles = Math.round(profiles * (0.6 + bit(11, 20) / 100));
  const nda = Math.round(realAccounts * (0.3 + bit(13, 20) / 100));
  const ncr = Math.round(nda * (0.7 + bit(15, 20) / 100));
  const undc = Math.max(0, realAccounts - nda - bit(17, 5));
  const tncr = Math.round(nda * (0.5 + bit(19, 20) / 100));
  const vtncr = Math.round(tncr * (0.6 + bit(21, 15) / 100));
  const tndc = Math.max(0, nda - tncr);
  const conversion = clicks > 0 ? Math.round((realAccounts / clicks) * 1000) / 10 : 0;
  const apcRate = Math.round((40 + bit(23, 30)) * 10) / 10;
  const activeTraders = Math.round(nda * (0.4 + bit(25, 30) / 100));
  const lots = Math.round(activeTraders * (2 + bit(27, 8)) * 10) / 10;
  const lotRebate = Math.round(lots * 8 * 10) / 10;
  const subCommission = Math.round(lotRebate * 0.6 * 10) / 10;
  const adjustment = bit(29, 21) - 10;
  const totalCommission = Math.round((subCommission + adjustment) * 10) / 10;

  return {
    period: periodLabel, clicks, subClicks, realAccounts, appRegs, profiles, appProfiles,
    nda, ncr, undc, tncr, vtncr, tndc, conversion, apcRate, activeTraders,
    lots, lotRebate, subCommission, adjustment, totalCommission,
  };
}

const CHART_SERIES = [
  { key: "clicks", color: "#0030EC" },
  { key: "realAccounts", color: "#1FA25A" },
  { key: "activeTraders", color: "#C77A12" },
] as const;

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const norm = v / base;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return niceNorm * base;
}

function topRoundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

function shortenPeriod(label: string): string {
  const dash = label.indexOf(" – ");
  return dash === -1 ? label : label.slice(0, dash);
}

function ComparisonChart({ rows }: { rows: ReportRow[] }) {
  const { t } = useLanguage();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = 900;
  const H = 300;
  const ML = 46;
  const MR = 12;
  const MT = 12;
  const MB = 36;
  const innerW = W - ML - MR;
  const innerH = H - MT - MB;
  const maxVal = Math.max(1, ...rows.flatMap((r) => [r.clicks, r.realAccounts, r.activeTraders]));
  const niceMax = niceCeil(maxVal);
  const groupW = innerW / rows.length;
  const barW = Math.min(24, (groupW - 12) / 3);
  const gap = 3;
  const groupContentW = barW * 3 + gap * 2;
  const yTicks = 4;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((niceMax * i) / yTicks));
  const labelEvery = Math.max(1, Math.ceil(rows.length / 8));
  const hovered = hoverIdx !== null ? rows[hoverIdx] : null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="panel-section-title" style={{ marginBottom: 8 }}>
        {t("camp.chartTitle")}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
        {CHART_SERIES.map((s) => (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-sub)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: "inline-block", flexShrink: 0 }} />
            {t(`camp.col.${s.key}`)}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={t("camp.chartTitle")}>
        <g transform={`translate(${ML},${MT})`}>
          {tickVals.map((v, i) => (
            <g key={i}>
              <line x1={0} x2={innerW} y1={innerH - (v / niceMax) * innerH} y2={innerH - (v / niceMax) * innerH} stroke="var(--border)" strokeWidth={1} />
              <text x={-8} y={innerH - (v / niceMax) * innerH} textAnchor="end" dominantBaseline="middle" fontSize={10.5} fill="var(--text-sub)">
                {v.toLocaleString()}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const gx = i * groupW;
            const startX = gx + (groupW - groupContentW) / 2;
            return (
              <g
                key={i}
                onMouseEnter={() => setHoverIdx(i)}
                onFocus={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                onBlur={() => setHoverIdx(null)}
                tabIndex={0}
                style={{ cursor: "pointer", outline: "none" }}
              >
                <rect x={gx} y={0} width={groupW} height={innerH} fill={hoverIdx === i ? "var(--bg-card2)" : "transparent"} />
                {CHART_SERIES.map((s, si) => {
                  const v = r[s.key as "clicks" | "realAccounts" | "activeTraders"];
                  const barH = (v / niceMax) * innerH;
                  const x = startX + si * (barW + gap);
                  return <path key={s.key} d={topRoundedRectPath(x, innerH - barH, barW, barH, 4)} fill={s.color} />;
                })}
                {i % labelEvery === 0 && (
                  <text x={gx + groupW / 2} y={innerH + 18} textAnchor="middle" fontSize={9.5} fill="var(--text-sub)">
                    {shortenPeriod(r.period)}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="var(--border)" strokeWidth={1} />
        </g>
      </svg>
      <div style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 6 }}>
        {hovered ? (
          <span>
            <strong style={{ color: "var(--white)" }}>{hovered.period}</strong>
            {" — "}
            {CHART_SERIES.map((s, i) => (
              <span key={s.key}>
                {i > 0 && " · "}
                {t(`camp.col.${s.key}`)}: <strong style={{ color: "var(--white)" }}>{hovered[s.key as "clicks" | "realAccounts" | "activeTraders"].toLocaleString()}</strong>
              </span>
            ))}
          </span>
        ) : (
          t("camp.chartHoverHint")
        )}
      </div>
    </div>
  );
}

function ThInfo({ label, info }: { label: string; info: string }) {
  return (
    <th>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        <span title={info}>
          <Icon name="info" style={{ fontSize: 14, color: "var(--text-sub)" }} />
        </span>
      </span>
    </th>
  );
}

function CampaignStats() {
  const { toast } = useCrm();
  const { t, lang } = useLanguage();
  const countries = [...WORLD_COUNTRIES].sort((a, b) => {
    const left = lang === "th" ? a.th : a.en;
    const right = lang === "th" ? b.th : b.en;
    return left < right ? -1 : left > right ? 1 : 0;
  });

  const [timeFrame, setTimeFrame] = useState<TimeFrame>("today");
  const [instrument, setInstrument] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const [country, setCountry] = useState("all");
  const [detail, setDetail] = useState<DetailLevel>("day");
  const [rows, setRows] = useState<ReportRow[] | null>(null);

  function generateReport() {
    const buckets = bucketsFor(timeFrame, detail);
    setRows(buckets.map((b) => generateRow(b.key, b.label, campaign, instrument, country)));
  }

  function exportReport() {
    if (!rows || !rows.length) {
      toast(t("camp.toast.generateFirst"));
      return;
    }
    const headers = [
      t("camp.col.period"), t("camp.col.clicks"), t("camp.col.subClicks"), t("camp.col.realAccounts"), t("camp.col.appRegs"),
      t("camp.col.profiles"), t("camp.col.appProfiles"), t("camp.col.nda"), t("camp.col.ncr"), t("camp.col.undc"),
      t("camp.col.tncr"), t("camp.col.vtncr"), t("camp.col.tndc"), t("camp.col.conversion"), t("camp.col.apcRate"),
      t("camp.col.activeTraders"), t("camp.col.lots"), t("camp.col.lotRebate"), t("camp.col.subCommission"),
      t("camp.col.adjustment"), t("camp.col.totalCommission"),
    ];
    const csvRows = rows.map((r) => [
      r.period, r.clicks, r.subClicks, r.realAccounts, r.appRegs, r.profiles, r.appProfiles,
      r.nda, r.ncr, r.undc, r.tncr, r.vtncr, r.tndc, r.conversion, r.apcRate, r.activeTraders,
      r.lots, r.lotRebate, r.subCommission, r.adjustment, r.totalCommission,
    ]);
    exportCsv("campaigns-report", headers, csvRows);
    toast(t("camp.toast.exported", { n: rows.length }));
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="panel-section-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {t("camp.title")}
        <span title={t("sub.campaigns")}>
          <Icon name="info" style={{ fontSize: 16, color: "var(--text-sub)" }} />
        </span>
      </div>

      <div className="toolbar" style={{ padding: "16px 0" }}>
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 180, maxWidth: 240 }}>
            <label>{t("camp.timeFrame")}</label>
            <select
              className="filter-select"
              value={timeFrame}
              onChange={(e) => {
                const next = e.target.value as TimeFrame;
                setTimeFrame(next);
                if (next === "compareMonths") setDetail("month");
              }}
            >
              {TIME_FRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {t(`camp.timeFrame.${tf}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160, maxWidth: 200 }}>
            <label>{t("camp.instrument")}</label>
            <select className="filter-select" value={instrument} onChange={(e) => setInstrument(e.target.value)}>
              <option value="all">{t("camp.allInstruments")}</option>
              {INSTRUMENTS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 180, maxWidth: 240 }}>
            <label>{t("camp.campaign")}</label>
            <select className="filter-select" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
              <option value="all">{t("camp.allCampaigns")}</option>
              {CAMPAIGNS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160, maxWidth: 220 }}>
            <label>{t("camp.country")}</label>
            <select className="filter-select" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="all">{t("camp.allCountries")}</option>
              {countries.map((c) => (
                <option key={c.en} value={c.en}>
                  {lang === "th" ? c.th : c.en}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 140, maxWidth: 180 }}>
            <label>{t("camp.detail")}</label>
            <select className="filter-select" value={detail} onChange={(e) => setDetail(e.target.value as DetailLevel)}>
              {DETAIL_LEVELS.map((d) => (
                <option key={d} value={d}>
                  {t(`camp.detail.${d}`)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }} />
          <div className="toolbar-actions">
            <button className="btn btn-ghost" onClick={exportReport}>
              <Icon name="download" />
              {t("camp.exportTo")}
            </button>
            <button className="btn btn-primary" onClick={generateReport}>
              {t("camp.generateReport")}
            </button>
          </div>
        </div>

        {rows && rows.length > 0 && <ComparisonChart rows={rows} />}

        <div className="table-wrap">
          <table className="data" style={{ minWidth: 2400 }}>
            <thead>
              <tr>
                <th>{t("camp.col.period")}</th>
                <th>{t("camp.col.clicks")}</th>
                <th>{t("camp.col.subClicks")}</th>
                <th>{t("camp.col.realAccounts")}</th>
                <th>{t("camp.col.appRegs")}</th>
                <th>{t("camp.col.profiles")}</th>
                <th>{t("camp.col.appProfiles")}</th>
                <ThInfo label={t("camp.col.nda")} info={t("camp.col.nda.info")} />
                <ThInfo label={t("camp.col.ncr")} info={t("camp.col.ncr.info")} />
                <ThInfo label={t("camp.col.undc")} info={t("camp.col.undc.info")} />
                <ThInfo label={t("camp.col.tncr")} info={t("camp.col.tncr.info")} />
                <ThInfo label={t("camp.col.vtncr")} info={t("camp.col.vtncr.info")} />
                <ThInfo label={t("camp.col.tndc")} info={t("camp.col.tndc.info")} />
                <th>{t("camp.col.conversion")}</th>
                <th>{t("camp.col.apcRate")}</th>
                <th>{t("camp.col.activeTraders")}</th>
                <th>{t("camp.col.lots")}</th>
                <th>{t("camp.col.lotRebate")}</th>
                <th>{t("camp.col.subCommission")}</th>
                <th>{t("camp.col.adjustment")}</th>
                <th>{t("camp.col.totalCommission")}</th>
              </tr>
            </thead>
            <tbody>
              {rows && rows.length ? (
                rows.map((r) => (
                  <tr key={r.period}>
                    <td className="mono">{r.period}</td>
                    <td className="mono">{r.clicks}</td>
                    <td className="mono">{r.subClicks}</td>
                    <td className="mono">{r.realAccounts}</td>
                    <td className="mono">{r.appRegs}</td>
                    <td className="mono">{r.profiles}</td>
                    <td className="mono">{r.appProfiles}</td>
                    <td className="mono">{r.nda}</td>
                    <td className="mono">{r.ncr}</td>
                    <td className="mono">{r.undc}</td>
                    <td className="mono">{r.tncr}</td>
                    <td className="mono">{r.vtncr}</td>
                    <td className="mono">{r.tndc}</td>
                    <td className="mono">{r.conversion}%</td>
                    <td className="mono">{r.apcRate}</td>
                    <td className="mono">{r.activeTraders}</td>
                    <td className="mono">{r.lots.toFixed(2)}</td>
                    <td className="mono">${r.lotRebate.toFixed(2)}</td>
                    <td className="mono">${r.subCommission.toFixed(2)}</td>
                    <td className="mono">${r.adjustment.toFixed(2)}</td>
                    <td className="mono">${r.totalCommission.toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={21}>
                    <div className="table-empty">{t("camp.empty")}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
  );
}

const SYMBOLS_BY_GROUP: Record<string, string[]> = {
  Forex: ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD"],
  Metals: ["XAUUSD", "XAGUSD"],
  Indices: ["US30", "US500", "NAS100", "GER40"],
  Crypto: ["BTCUSD", "ETHUSD"],
  CFDs: ["OIL", "NATGAS"],
};
const BASE_PRICE: Record<string, number> = {
  EURUSD: 1.08, GBPUSD: 1.27, USDJPY: 149, AUDUSD: 0.66, USDCAD: 1.36,
  XAUUSD: 2350, XAGUSD: 28,
  US30: 39500, US500: 5500, NAS100: 19000, GER40: 18500,
  BTCUSD: 62000, ETHUSD: 3400,
  OIL: 78, NATGAS: 2.6,
};
const ACCOUNT_TYPES = ["Standard", "Ultra Low", "Raw Spread"];
const CURRENCIES = ["USD", "EUR", "THB"];

type TxRow = {
  tradeNo: number;
  mt4id: string;
  accountType: string;
  currency: string;
  brand: string;
  campaign: string;
  openTime: string;
  closeTime: string;
  direction: "Buy" | "Sell";
  orderType: "Market" | "Pending";
  instrument: string;
  group: string;
  lots: number;
  openPrice: number;
  closePrice: number;
  totalCommission: number;
  affiliateCommission: number;
};

function generateTransactions(range: DateRange, campaign: string, instrument: string, mt4Filter: string): TxRow[] {
  const from = range.from ? new Date(range.from + "T00:00:00") : addDays(new Date(), -60);
  const to = range.to ? new Date(range.to + "T00:00:00") : new Date();
  const groups = instrument === "all" ? INSTRUMENTS : [instrument];
  const maxRows = 60;
  const rows: TxRow[] = [];

  for (let d = new Date(from); d <= to && rows.length < maxRows; d = addDays(d, 1)) {
    const dayKey = isoDay(d);
    const perDay = 1 + (hash(`${dayKey}|count|${campaign}|${instrument}|${mt4Filter}`) % 3);
    for (let k = 0; k < perDay && rows.length < maxRows; k++) {
      const h = hash(`${dayKey}|${k}|${campaign}|${instrument}|${mt4Filter}`);
      const bit = (shift: number, mod: number) => (h >>> shift) % mod;
      const group = groups[bit(1, groups.length)];
      const symbols = SYMBOLS_BY_GROUP[group];
      const symbol = symbols[bit(3, symbols.length)];
      const base = BASE_PRICE[symbol];
      const mt4id = mt4Filter.trim() || String(60000000 + bit(5, 9999999));
      const camp = campaign === "all" ? CAMPAIGNS[bit(7, CAMPAIGNS.length)] : campaign;
      const direction: "Buy" | "Sell" = bit(9, 2) === 0 ? "Buy" : "Sell";
      const lots = Math.round((0.1 + bit(11, 50) / 10) * 100) / 100;
      const openPrice = Math.round(base * (1 + (bit(13, 200) - 100) / 10000) * 10000) / 10000;
      const closePrice = Math.round(base * (1 + (bit(15, 300) - 150) / 10000) * 10000) / 10000;
      const totalCommission = Math.round(lots * 7 * 10) / 10;
      const affiliateCommission = Math.round(totalCommission * 0.5 * 10) / 10;
      const openHour = 6 + bit(17, 14);
      const openMin = bit(19, 60);
      const closeHour = Math.min(23, openHour + 1 + bit(21, 6));
      const closeMin = bit(23, 60);
      rows.push({
        tradeNo: 9000000 + bit(25, 999999),
        mt4id,
        accountType: ACCOUNT_TYPES[bit(27, ACCOUNT_TYPES.length)],
        currency: CURRENCIES[bit(29, CURRENCIES.length)],
        brand: "XM",
        campaign: camp,
        openTime: `${dayKey} ${pad2(openHour)}:${pad2(openMin)}`,
        closeTime: `${dayKey} ${pad2(closeHour)}:${pad2(closeMin)}`,
        direction,
        orderType: bit(2, 2) === 0 ? "Market" : "Pending",
        instrument: symbol,
        group,
        lots,
        openPrice,
        closePrice,
        totalCommission,
        affiliateCommission,
      });
    }
  }
  return rows;
}

function defaultTxRange(): DateRange {
  const today = new Date();
  return { from: isoDay(addDays(today, -60)), to: isoDay(today) };
}

function TraderTransactions() {
  const { toast } = useCrm();
  const { t } = useLanguage();
  const [range, setRange] = useState<DateRange>(defaultTxRange);
  const [instrument, setInstrument] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const [mt4id, setMt4id] = useState("");
  const [rows, setRows] = useState<TxRow[] | null>(null);

  function generateReport() {
    setRows(generateTransactions(range, campaign, instrument, mt4id));
  }

  function exportReport() {
    if (!rows || !rows.length) {
      toast(t("camp.toast.generateFirst"));
      return;
    }
    const headers = [
      t("camp.col.tradeNo"), t("camp.mt4id"), t("camp.col.accountType"), t("camp.col.currency"), t("camp.col.brand"),
      t("camp.campaign"), t("camp.col.openTime"), t("camp.col.closeTime"), t("camp.col.tradeType"), t("camp.col.orderType"),
      t("camp.instrument"), t("camp.col.instrumentGroup"), t("camp.col.lots"), t("camp.col.openPrice"), t("camp.col.closePrice"),
      t("camp.col.totalCommission"), t("camp.col.affiliateCommission"),
    ];
    const csvRows = rows.map((r) => [
      r.tradeNo, r.mt4id, r.accountType, r.currency, r.brand, r.campaign, r.openTime, r.closeTime, r.direction, r.orderType,
      r.instrument, r.group, r.lots, r.openPrice, r.closePrice, r.totalCommission, r.affiliateCommission,
    ]);
    exportCsv("trader-transactions", headers, csvRows);
    toast(t("camp.toast.exported", { n: rows.length }));
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="panel-section-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {t("camp.tabTransactions")}
        <span title={t("sub.campaigns")}>
          <Icon name="info" style={{ fontSize: 16, color: "var(--text-sub)" }} />
        </span>
      </div>

      <div className="toolbar" style={{ padding: "16px 0" }}>
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220, maxWidth: 280 }}>
          <label>{t("camp.timeFrame")}</label>
          <DateRangePicker value={range} onChange={setRange} placeholder={t("camp.dateRangePlaceholder")} />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 180, maxWidth: 240 }}>
          <label>{t("camp.campaign")}</label>
          <select className="filter-select" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
            <option value="all">{t("camp.allCampaigns")}</option>
            {CAMPAIGNS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160, maxWidth: 200 }}>
          <label>{t("camp.instrument")}</label>
          <select className="filter-select" value={instrument} onChange={(e) => setInstrument(e.target.value)}>
            <option value="all">{t("camp.allInstruments")}</option>
            {INSTRUMENTS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160, maxWidth: 220 }}>
          <label>{t("camp.mt4id")}</label>
          <input className="input" value={mt4id} onChange={(e) => setMt4id(e.target.value)} placeholder={t("camp.mt4idPlaceholder")} />
        </div>
        <div style={{ flex: 1 }} />
        <div className="toolbar-actions">
          <button className="btn btn-ghost" onClick={exportReport}>
            <Icon name="download" />
            {t("camp.exportTo")}
          </button>
          <button className="btn btn-primary" onClick={generateReport}>
            {t("camp.generateReport")}
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data" style={{ minWidth: 2000 }}>
          <thead>
            <tr>
              <th>{t("camp.col.tradeNo")}</th>
              <th>{t("camp.mt4id")}</th>
              <th>{t("camp.col.accountType")}</th>
              <th>{t("camp.col.currency")}</th>
              <th>{t("camp.col.brand")}</th>
              <th>{t("camp.campaign")}</th>
              <th>{t("camp.col.openTime")}</th>
              <th>{t("camp.col.closeTime")}</th>
              <th>{t("camp.col.tradeType")}</th>
              <th>{t("camp.col.orderType")}</th>
              <th>{t("camp.instrument")}</th>
              <th>{t("camp.col.instrumentGroup")}</th>
              <th>{t("camp.col.lots")}</th>
              <th>{t("camp.col.openPrice")}</th>
              <th>{t("camp.col.closePrice")}</th>
              <th>{t("camp.col.totalCommission")}</th>
              <th>{t("camp.col.affiliateCommission")}</th>
            </tr>
          </thead>
          <tbody>
            {rows && rows.length ? (
              rows.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.tradeNo}</td>
                  <td className="mono">{r.mt4id}</td>
                  <td>{r.accountType}</td>
                  <td>{r.currency}</td>
                  <td>{r.brand}</td>
                  <td>{r.campaign}</td>
                  <td className="mono">{r.openTime}</td>
                  <td className="mono">{r.closeTime}</td>
                  <td>{r.direction}</td>
                  <td>{r.orderType}</td>
                  <td className="mono">{r.instrument}</td>
                  <td>{r.group}</td>
                  <td className="mono">{r.lots.toFixed(2)}</td>
                  <td className="mono">{r.openPrice}</td>
                  <td className="mono">{r.closePrice}</td>
                  <td className="mono">${r.totalCommission.toFixed(2)}</td>
                  <td className="mono">${r.affiliateCommission.toFixed(2)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={17}>
                  <div className="table-empty">{t("camp.empty")}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type LotCheckData = {
  account: Array<{ campaignName: string; loginId: string; lots: number }>;
  campaigns: Array<{ campaignName: string; lots: number }>;
  countries: Array<{ country: string; lots: number }>;
  excludedSymbols: Array<{ campaignName: string; loginId: string; instrument: string; lots: number }>;
  totalLots: number;
};

type LotAutomation = {
  database: boolean;
  linkedMember: { id: number; code: string; name: string } | null;
  qualified: boolean | null;
  requiredLots: number | null;
  granted: number;
  renewed: number;
  skipped: string | null;
};

function LotCheckPanel() {
  const [range, setRange] = useState<DateRange>(defaultTxRange);
  const [tradeId, setTradeId] = useState("17416988");
  const [autoGrant, setAutoGrant] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ data: LotCheckData; automation: LotAutomation } | null>(null);

  async function checkLots() {
    if (!range.from || !range.to) {
      setError("กรุณาเลือกช่วงวันที่");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/crm/lot-check/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom: range.from, dateTo: range.to, tradeId, autoGrant }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; data?: LotCheckData; automation?: LotAutomation; dateFrom?: string; dateTo?: string };
      if (!response.ok || !payload.ok || !payload.data || !payload.automation) throw new Error(payload.error || "ตรวจ Lot ไม่สำเร็จ");
      if (payload.dateFrom && payload.dateTo) setRange({ from: payload.dateFrom, to: payload.dateTo });
      setResult({ data: payload.data, automation: payload.automation });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ตรวจ Lot ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="panel-section-title" style={{ display: "flex", alignItems: "center", gap: 7 }}>
        ตรวจ Lot และต่อ Indicator
        <span title="ผลจาก BeSight Lot API จะถูกบันทึกและนำไปตรวจสิทธิ์สมาชิก">
          <Icon name="info" style={{ fontSize: 16, color: "var(--text-sub)" }} />
        </span>
      </div>

      <div className="toolbar" style={{ padding: "16px 0" }}>
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220, maxWidth: 290 }}>
          <label>ช่วงวันที่</label>
          <DateRangePicker value={range} onChange={setRange} placeholder="เลือกช่วงวันที่" />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 180, maxWidth: 240 }}>
          <label>Trade ID</label>
          <input className="input" value={tradeId} onChange={(event) => setTradeId(event.target.value.replace(/\D/g, ""))} placeholder="เช่น 17416988" />
        </div>
        <label className="lot-auto-toggle">
          <input type="checkbox" checked={autoGrant} onChange={(event) => setAutoGrant(event.target.checked)} />
          <span>
            <strong>ต่อ Indicator อัตโนมัติ</strong>
            <small>เมื่อ Lot ถึงเกณฑ์ของสมาชิก</small>
          </span>
        </label>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => void checkLots()} disabled={loading}>
          <Icon name={loading ? "progress_activity" : "query_stats"} />
          {loading ? "กำลังตรวจ..." : "ตรวจ Lot"}
        </button>
      </div>

      {error && <div className="lot-message error"><Icon name="error" />{error}</div>}

      {result && (
        <>
          <div className="stat-grid cols-3 lot-summary">
            <div className="stat-card">
              <div className="value">{result.data.totalLots.toFixed(4)}</div>
              <div className="label">Lot ของ Trade ID</div>
            </div>
            <div className="stat-card">
              <div className="value">{result.automation.requiredLots == null ? "—" : result.automation.requiredLots.toFixed(2)}</div>
              <div className="label">เกณฑ์ที่ต้องผ่าน</div>
            </div>
            <div className="stat-card">
              <div className={`value lot-result ${result.automation.qualified ? "pass" : "fail"}`}>
                {result.automation.qualified == null ? "ไม่พบสมาชิก" : result.automation.qualified ? "ผ่าน" : "ยังไม่ผ่าน"}
              </div>
              <div className="label">ผลตรวจสิทธิ์</div>
            </div>
          </div>

          <div className={`lot-message ${result.automation.qualified ? "success" : "neutral"}`}>
            <Icon name={result.automation.qualified ? "verified" : "info"} />
            <div>
              <strong>{result.automation.linkedMember ? `${result.automation.linkedMember.name} · ${result.automation.linkedMember.code}` : "ยังไม่ผูก Trade ID กับสมาชิกใน MariaDB"}</strong>
              <span>
                {result.automation.granted || result.automation.renewed
                  ? `เปิดสิทธิ์ใหม่ ${result.automation.granted} และต่ออายุ ${result.automation.renewed} Indicator`
                  : result.automation.skipped || "บันทึกผลตรวจเรียบร้อย"}
              </span>
            </div>
          </div>

          <div className="panel-section-title" style={{ marginTop: 8 }}>ผลของ Trade ID นี้</div>
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Login ID</th>
                  <th>Lots</th>
                </tr>
              </thead>
              <tbody>
                {result.data.account.length ? result.data.account.map((row, index) => (
                  <tr key={`account-${index}`}>
                    <td>{row.campaignName || "—"}</td>
                    <td className="mono">{row.loginId || "—"}</td>
                    <td className="mono">{row.lots.toFixed(8)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={3}><div className="table-empty">ไม่พบข้อมูลในช่วงวันที่นี้</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function LotOverviewPanel() {
  const [range, setRange] = useState<DateRange>(defaultTxRange);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<LotCheckData | null>(null);
  const [tab, setTab] = useState<"campaign" | "country" | "symbol">("campaign");

  async function load() {
    if (!range.from || !range.to) {
      setError("กรุณาเลือกช่วงวันที่");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/crm/lot-check/?date_from=${range.from}&date_to=${range.to}`, { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; error?: string; data?: LotCheckData };
      if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error || "ดึงภาพรวมไม่สำเร็จ");
      setData(payload.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ดึงภาพรวมไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  const rows: Array<{ campaignName?: string; loginId?: string; country?: string; instrument?: string; lots: number }> | undefined =
    tab === "campaign" ? data?.campaigns : tab === "country" ? data?.countries : data?.excludedSymbols;

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="panel-section-title" style={{ display: "flex", alignItems: "center", gap: 7 }}>
        ภาพรวม Lot ทั้งระบบ
        <span title="ตัวเลขในหน้านี้รวมทุกสมาชิกในระบบ ไม่ใช่ของ Trade ID ใดโดยเฉพาะ — ใช้ดูภาพรวมแคมเปญ/ประเทศ/ตราสารนอกรายการ">
          <Icon name="info" style={{ fontSize: 16, color: "var(--text-sub)" }} />
        </span>
      </div>

      <div className="toolbar" style={{ padding: "16px 0" }}>
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220, maxWidth: 290 }}>
          <label>ช่วงวันที่</label>
          <DateRangePicker value={range} onChange={setRange} placeholder="เลือกช่วงวันที่" />
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => void load()} disabled={loading}>
          <Icon name={loading ? "progress_activity" : "query_stats"} />
          {loading ? "กำลังดึงข้อมูล..." : "ดึงภาพรวม"}
        </button>
      </div>

      {error && <div className="lot-message error"><Icon name="error" />{error}</div>}

      {data && (
        <>
          <div className="tabs lot-result-tabs">
            <button className={`tab${tab === "campaign" ? " is-active" : ""}`} onClick={() => setTab("campaign")}>Campaign <span className="n">{data.campaigns.length}</span></button>
            <button className={`tab${tab === "country" ? " is-active" : ""}`} onClick={() => setTab("country")}>Country <span className="n">{data.countries.length}</span></button>
            <button className={`tab${tab === "symbol" ? " is-active" : ""}`} onClick={() => setTab("symbol")}>Symbol นอก List <span className="n">{data.excludedSymbols.length}</span></button>
          </div>

          <div className="table-wrap">
            <table className="data" style={{ minWidth: tab === "symbol" ? 760 : 520 }}>
              <thead>
                <tr>
                  {tab !== "country" && <th>Campaign</th>}
                  {tab === "symbol" && <th>Login ID</th>}
                  {tab === "country" && <th>Country</th>}
                  {tab === "symbol" && <th>Instrument</th>}
                  <th>Lots</th>
                </tr>
              </thead>
              <tbody>
                {rows?.length ? rows.map((row, index) => (
                  <tr key={`${tab}-${index}`}>
                    {tab !== "country" && <td>{row.campaignName || "—"}</td>}
                    {tab === "symbol" && <td className="mono">{row.loginId || "—"}</td>}
                    {tab === "country" && <td>{row.country || "—"}</td>}
                    {tab === "symbol" && <td className="mono">{row.instrument || "—"}</td>}
                    <td className="mono">{row.lots.toFixed(8)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4}><div className="table-empty">ไม่พบข้อมูลในช่วงวันที่นี้</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function CampaignsPage() {
  const { crmDataStatus } = useCrm();
  const { t } = useLanguage();
  const [tab, setTab] = useState<"stats" | "transactions" | "lotCheck" | "lotOverview">("stats");

  if (crmDataStatus === "loading") return <CampaignsSkeleton />;

  return (
    <section className="panel is-active">
      <div className="tabs" style={{ marginBottom: 18 }}>
        <button className={`tab${tab === "stats" ? " is-active" : ""}`} onClick={() => setTab("stats")}>
          {t("camp.tabStats")}
        </button>
        <button className={`tab${tab === "transactions" ? " is-active" : ""}`} onClick={() => setTab("transactions")}>
          {t("camp.tabTransactions")}
        </button>
        <button className={`tab${tab === "lotCheck" ? " is-active" : ""}`} onClick={() => setTab("lotCheck")}>
          ตรวจ Lot
        </button>
        <button className={`tab${tab === "lotOverview" ? " is-active" : ""}`} onClick={() => setTab("lotOverview")}>
          ภาพรวม Lot ทั้งระบบ
        </button>
      </div>
      {tab === "stats" ? <CampaignStats /> : tab === "transactions" ? <TraderTransactions /> : tab === "lotCheck" ? <LotCheckPanel /> : <LotOverviewPanel />}
    </section>
  );
}
