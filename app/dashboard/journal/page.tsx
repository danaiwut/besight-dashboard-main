"use client";

import { Fragment, useMemo, useState } from "react";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { useCrm, displayNameOf } from "../../../components/crm/CrmContext";
import { useCustomerData } from "../../../components/dashboard/useCustomerData";
import { useTheme } from "../../../components/dashboard/ThemeContext";
import Icon from "../../../components/Icon";
import { INITIAL_ACCOUNTS, TRADE_TAGS, journalStats, tradesByDay, balanceSeries, type JournalAccount, type JournalTrade } from "../../../lib/journal";
import { exportCsv } from "../../../lib/exportCsv";

function fmtMoney(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}, ${d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

// Simple SVG semi-circle gauge: green arc for the win share, red for the rest.
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 180) * Math.PI) / 180;
  // Rounded to a fixed precision so the server-rendered and client-hydrated
  // path strings always match exactly — raw trig results can differ in the
  // last bit between server (Node) and browser V8 builds.
  return { x: Math.round((cx + r * Math.cos(a)) * 10000) / 10000, y: Math.round((cy + r * Math.sin(a)) * 10000) / 10000 };
}
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function Gauge({ winPct }: { winPct: number }) {
  const clamped = Math.max(0, Math.min(100, winPct));
  const splitAngle = (clamped / 100) * 180;
  return (
    <svg viewBox="0 0 200 110" className="journal-gauge-svg">
      <path d={describeArc(100, 100, 80, 0, 180)} className="journal-gauge-track" />
      {clamped > 0 && <path d={describeArc(100, 100, 80, 0, splitAngle)} className="journal-gauge-win" />}
      {clamped < 100 && <path d={describeArc(100, 100, 80, splitAngle, 180)} className="journal-gauge-loss" />}
    </svg>
  );
}

function Radar({ values }: { values: { label: string; value: number }[] }) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 78;
  const angleStep = (2 * Math.PI) / values.length;
  const pointAt = (i: number, scale: number) => {
    const angle = -Math.PI / 2 + i * angleStep;
    // Rounded so server/client trig results always agree exactly (see polarToCartesian above).
    return { x: Math.round((cx + Math.cos(angle) * r * scale) * 10000) / 10000, y: Math.round((cy + Math.sin(angle) * r * scale) * 10000) / 10000 };
  };
  const gridLevels = [0.33, 0.66, 1];
  const dataPoints = values.map((v, i) => pointAt(i, Math.max(0.06, v.value)));
  const dataPath = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="journal-radar-svg">
      {gridLevels.map((lvl) => (
        <polygon
          key={lvl}
          points={values.map((_, i) => pointAt(i, lvl)).map((p) => `${p.x},${p.y}`).join(" ")}
          className="journal-radar-grid"
        />
      ))}
      {values.map((_, i) => {
        const p = pointAt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} className="journal-radar-grid" />;
      })}
      <polygon points={dataPath} className="journal-radar-shape" />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.5} className="journal-radar-dot" />
      ))}
      {values.map((v, i) => {
        const p = pointAt(i, 1.32);
        return (
          <text key={v.label} x={p.x} y={p.y} className="journal-radar-label" textAnchor="middle" dominantBaseline="middle">
            {v.label}
          </text>
        );
      })}
    </svg>
  );
}

function BalanceChart({ trades, startBalance }: { trades: JournalTrade[]; startBalance: number }) {
  const { points: bal } = balanceSeries(trades, startBalance);
  // Equity: a deterministic, slightly noisier variant of the balance walk so the
  // chart reads as two related-but-distinct lines, same as the reference.
  const equity = bal.map((p, i) => ({ ...p, value: p.balance + Math.sin(i * 1.7) * 6 - 3 }));
  const values = [startBalance, ...bal.map((p) => p.balance), ...equity.map((p) => p.value)];
  const min = Math.min(...values) - 10;
  const max = Math.max(...values) + 10;
  const w = 900;
  const h = 220;
  const n = bal.length || 1;
  const xAt = (i: number) => (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const yAt = (v: number) => h - ((v - min) / (max - min)) * h;

  const balPath = bal.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(p.balance)}`).join(" ");
  const eqPath = equity.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(p.value)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="journal-line-svg" preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={0} x2={w} y1={h * f} y2={h * f} className="journal-line-grid" />
      ))}
      <path d={eqPath} className="journal-line-equity" />
      <path d={balPath} className="journal-line-balance" />
      {bal.map((p, i) => (
        <circle key={`b${i}`} cx={xAt(i)} cy={yAt(p.balance)} r={3} className="journal-line-dot-balance" />
      ))}
    </svg>
  );
}

type LimitKey = "dailyLoss" | "maxLoss" | "profitTarget";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: startOffset }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function TradingJournalPage() {
  const { t, lang } = useLanguage();
  const { theme } = useTheme();
  const { toast } = useCrm();
  const { member, accounts: registeredAccounts, brokerFor } = useCustomerData();

  const [accounts, setAccounts] = useState<JournalAccount[]>(INITIAL_ACCOUNTS);
  const [selectedAccountId, setSelectedAccountId] = useState(INITIAL_ACCOUNTS[0].id);
  const account = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0];
  const trades = account.trades;

  function analyzeWithAi() {
    toast(t("dash.journal.aiAnalysis.toast"));
  }

  function exportTrades() {
    if (!trades.length) {
      toast(t("dash.journal.export.emptyToast"));
      return;
    }
    const headers = ["Symbol", "Side", "Open Date", "Close Date", "Open Price", "Close Price", "Lots", "P&L"];
    const rows = trades.map((tr) => [tr.symbol, tr.side, fmtDateTime(tr.openDate), fmtDateTime(tr.closeDate), tr.openPrice, tr.closePrice, tr.lots, tr.pnl.toFixed(2)]);
    exportCsv(`journal-${account.id}`, headers, rows);
    toast(t("dash.journal.export.toast", { n: trades.length }));
  }

  const linkedIds = useMemo(() => new Set(accounts.map((a) => a.id)), [accounts]);
  const availableTradeAccounts = useMemo(
    () => registeredAccounts.filter((a) => !linkedIds.has(a.tradeId)),
    [registeredAccounts, linkedIds],
  );

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [selectedTradeId, setSelectedTradeId] = useState("");
  const [newPlatform, setNewPlatform] = useState("MetaTrader 5");
  const [newSize, setNewSize] = useState("1000");

  const effectiveTradeId = selectedTradeId || availableTradeAccounts[0]?.tradeId || "";
  const pickedRegisteredAccount = availableTradeAccounts.find((a) => a.tradeId === effectiveTradeId);

  function openAddAccount() {
    setSelectedTradeId("");
    setShowAddAccount(true);
  }

  function addAccount() {
    const size = parseFloat(newSize);
    if (!pickedRegisteredAccount || !Number.isFinite(size) || size <= 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const acc: JournalAccount = {
      id: pickedRegisteredAccount.tradeId,
      createdDate: today,
      broker: brokerFor(pickedRegisteredAccount)?.name ?? "—",
      accountType: pickedRegisteredAccount.accountType,
      platform: newPlatform,
      size,
      startDate: today,
      trades: [],
    };
    setAccounts((cur) => [...cur, acc]);
    setSelectedAccountId(acc.id);
    setShowAddAccount(false);
    setNewSize("1000");
    toast(t("dash.journal.account.added"));
  }

  const accountPreviews = useMemo(
    () =>
      accounts.map((acc) => {
        const s = journalStats(acc.trades);
        const { current } = balanceSeries(acc.trades, acc.size);
        return { id: acc.id, balance: current, pnl: s.totalPnl, pnlPct: acc.size ? (s.totalPnl / acc.size) * 100 : 0 };
      }),
    [accounts],
  );

  const [tab, setTab] = useState<"history" | "open">("history");
  const [viewYear, setViewYear] = useState(2025);
  const [viewMonth, setViewMonth] = useState(10); // November (0-indexed)
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [tradeTags, setTradeTags] = useState<Record<number, string[]>>({});
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [draftTags, setDraftTags] = useState<string[]>([]);

  function startEditNote(trade: JournalTrade) {
    setEditingNoteId(trade.id);
    setDraftNote(notes[trade.id] ?? "");
    setDraftTags(tradeTags[trade.id] ?? []);
  }

  function toggleDraftTag(tag: string) {
    setDraftTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));
  }

  function saveNote(id: number) {
    setNotes((cur) => ({ ...cur, [id]: draftNote.trim() }));
    setTradeTags((cur) => ({ ...cur, [id]: draftTags }));
    setEditingNoteId(null);
    toast(t("dash.journal.note.saved"));
  }

  function cancelEditNote() {
    setEditingNoteId(null);
  }

  const stats = useMemo(() => journalStats(trades), [trades]);
  const byDay = useMemo(() => tradesByDay(trades), [trades]);
  const { max: maxBalance, current: currentBalance } = useMemo(() => balanceSeries(trades, account.size), [trades, account.size]);
  const currentEquity = currentBalance - 271.11; // demo float, matches the reference's balance/equity gap
  const maxEquity = maxBalance + 6.44;

  const todayIso = new Date().toISOString().slice(0, 10);
  const todaysProfit = byDay.get(todayIso)?.pnl ?? 0;

  const worstDay = Math.min(0, ...Array.from(byDay.values()).map((d) => d.pnl));
  const [maxDailyLossLimit, setMaxDailyLossLimit] = useState(250);
  const dailyLossBreached = Math.abs(worstDay) > maxDailyLossLimit;
  const [maxLossLimit, setMaxLossLimit] = useState(500);
  const lossUsed = Math.max(0, -stats.totalPnl);
  const [profitTarget, setProfitTarget] = useState(400);
  const profitProgress = Math.max(0, stats.totalPnl);

  const [editingLimit, setEditingLimit] = useState<LimitKey | null>(null);
  const [draftLimit, setDraftLimit] = useState("");

  function startEditLimit(key: LimitKey, current: number) {
    setEditingLimit(key);
    setDraftLimit(String(current));
  }

  function cancelEditLimit() {
    setEditingLimit(null);
  }

  function saveLimit(key: LimitKey) {
    const val = Math.abs(parseFloat(draftLimit));
    if (Number.isFinite(val) && val > 0) {
      if (key === "dailyLoss") setMaxDailyLossLimit(val);
      if (key === "maxLoss") setMaxLossLimit(val);
      if (key === "profitTarget") setProfitTarget(val);
      toast(t("dash.journal.rule.limitSaved"));
    }
    setEditingLimit(null);
  }

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(lang === "th" ? "th-TH" : "en-US", { month: "long", year: "numeric" });
  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const weeks = useMemo(() => {
    const out: (number | null)[][] = [];
    for (let i = 0; i < grid.length; i += 7) out.push(grid.slice(i, i + 7));
    return out;
  }, [grid]);

  function changeMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  const sortedTrades = useMemo(() => [...trades].sort((a, b) => b.closeDate.localeCompare(a.closeDate)), [trades]);

  return (
    <div className="journal-layout">
      <aside className="journal-sidebar">
        <div className="card journal-greeting-card">
          <div className="journal-greeting-name">{t("dash.journal.sidebar.greeting", { name: displayNameOf(member).split(" ")[0] })}</div>
          <div className="journal-greeting-sub">{t("dash.journal.sidebar.subtitle")}</div>
        </div>

        <button type="button" className="btn btn-primary journal-add-account-btn" onClick={() => (showAddAccount ? setShowAddAccount(false) : openAddAccount())}>
          <Icon name="add_circle" />
          {t("dash.journal.account.addBtn")}
        </button>

        {showAddAccount && (
          <div className="card journal-add-account-form">
            {availableTradeAccounts.length > 0 ? (
              <>
                <div className="field">
                  <label>{t("dash.journal.account.registeredAccount")}</label>
                  <select className="input" value={effectiveTradeId} onChange={(e) => setSelectedTradeId(e.target.value)}>
                    {availableTradeAccounts.map((a) => (
                      <option key={a.tradeId} value={a.tradeId}>
                        {a.tradeId} — {brokerFor(a)?.name} ({a.accountType})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>{t("dash.journal.account.platform")}</label>
                  <select className="input" value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)}>
                    <option value="MetaTrader 5">MetaTrader 5</option>
                    <option value="MetaTrader 4">MetaTrader 4</option>
                  </select>
                </div>
                <div className="field">
                  <label>{t("dash.journal.account.startingBalance")}</label>
                  <input type="number" className="input" value={newSize} onChange={(e) => setNewSize(e.target.value)} />
                </div>
                <div className="journal-add-account-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAddAccount(false)}>
                    {t("common.cancel")}
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={addAccount}>
                    {t("dash.journal.account.create")}
                  </button>
                </div>
              </>
            ) : (
              <div className="journal-add-account-empty">{t("dash.journal.account.noneRegistered")}</div>
            )}
          </div>
        )}

        <div className="panel-section-title" style={{ margin: 0 }}>
          {t("dash.journal.sidebar.title")}
        </div>
        <div className="journal-account-list">
          {accounts.map((acc) => {
            const preview = accountPreviews.find((p) => p.id === acc.id);
            const active = acc.id === selectedAccountId;
            return (
              <button
                key={acc.id}
                type="button"
                className={`journal-account-card${active ? " is-active" : ""}`}
                onClick={() => setSelectedAccountId(acc.id)}
              >
                <div className="journal-account-card-head">
                  <span className="journal-account-card-id">#{acc.id}</span>
                  {active && (
                    <span className="journal-account-card-badge">
                      <Icon name="check_circle" />
                      {t("dash.journal.account.viewing")}
                    </span>
                  )}
                </div>
                <div className="journal-account-card-meta">
                  {acc.broker} · {acc.accountType} · {acc.platform}
                </div>
                <div className="journal-account-card-stats">
                  <div>
                    <span className="k">{t("dash.journal.balance")}</span>
                    <span className="v">${(preview?.balance ?? acc.size).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="k">{t("dash.journal.col.pnl")}</span>
                    <span className={`v ${(preview?.pnl ?? 0) >= 0 ? "is-pos" : "is-neg"}`}>{fmtMoney(preview?.pnl ?? 0)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="journal-main">
      <div className="journal-header">
        <div className="journal-header-left">
          <span className="journal-account-id">#{account.id}</span>
          <span className="journal-created">{t("dash.journal.created", { date: fmtDate(account.createdDate) })}</span>
        </div>
        <div className="journal-header-pills">
          <span className="journal-pill journal-pill-broker">
            {/* eslint-disable-next-line @next/next/no-img-element -- static export, brand logo asset */}
            <img
              className="journal-broker-logo"
              src={theme === "dark" ? "/img/broker/XM-Logo-White-RGB.png" : "/img/broker/XM-Logo-Black-RGB.png"}
              alt={account.broker}
            />
          </span>
          <span className="journal-pill">{account.accountType}</span>
          <span className="journal-pill">{account.platform}</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button type="button" className="btn btn-primary" style={{ padding: "6px 12px", width: 172, minWidth: "auto" }} onClick={analyzeWithAi}>
            <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>✦</span>
            {t("dash.journal.aiAnalysis.btn")}
          </button>
          <button type="button" className="btn btn-ghost" style={{ padding: "6px 12px", width: 172, minWidth: "auto" }} onClick={exportTrades}>
            <Icon name="download" style={{ fontSize: 15 }} />
            {t("common.export")}
          </button>
        </div>
      </div>

      <div className="stat-grid cols-3" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="value">${account.size.toFixed(2)}</div>
          <div className="label">{t("dash.journal.accountSize")}</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: todaysProfit > 0 ? "var(--green)" : todaysProfit < 0 ? "var(--red)" : undefined }}>
            {fmtMoney(todaysProfit)}
          </div>
          <div className="label">{t("dash.journal.todaysProfit")}</div>
        </div>
        <div className="stat-card">
          <div className="value">{fmtDate(account.startDate)}</div>
          <div className="label">{t("dash.journal.startDate")}</div>
        </div>
      </div>

      <div className="journal-top-row">
        <div className="journal-score-card">
          <div className="journal-score-head">
            <Icon name="bolt" />
            {t("dash.journal.score")}
          </div>
          <Radar
            values={[
              { label: t("dash.journal.consistency"), value: 0.62 },
              { label: t("dash.journal.slUsage"), value: 0.78 },
              { label: t("dash.journal.wr"), value: stats.winRate / 100 },
              { label: t("dash.journal.rr"), value: 0.3 },
            ]}
          />
          <div className="journal-score-num">{Math.min(10, Math.max(0, 10 - lossUsed / 100)).toFixed(2)}</div>
        </div>

        <div className="card journal-equity-card">
          <div className="journal-equity-row">
            <span className="k">{t("dash.journal.balance")}</span>
            <span className="v">${currentBalance.toFixed(2)}</span>
          </div>
          <div className="journal-equity-track">
            <span className="dot" />
            <span className="line" />
          </div>
          <div className="journal-equity-max">
            ${maxBalance.toFixed(2)} <span className="max">{t("dash.journal.max")}</span>
          </div>

          <div className="journal-equity-row" style={{ marginTop: 22 }}>
            <span className="k">{t("dash.journal.equity")}</span>
            <span className="v">${currentEquity.toFixed(2)}</span>
          </div>
          <div className="journal-equity-track">
            <span className="dot is-equity" />
            <span className="line" />
          </div>
          <div className="journal-equity-max">
            ${maxEquity.toFixed(2)} <span className="max">{t("dash.journal.max")}</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 24, marginTop: 20 }}>
        <div className="panel-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {t("dash.journal.accountBalance")}
        </div>
        <div className="journal-chart-legend">
          <span className="journal-legend-chip is-balance">{t("dash.journal.balance")}</span>
          <span className="journal-legend-chip is-equity">{t("dash.journal.equity")}</span>
        </div>
        <BalanceChart trades={trades} startBalance={account.size} />
      </div>

      <div className="stat-grid" style={{ margin: "20px 0" }}>
        <div className="stat-card">
          <div className="value" style={{ color: "var(--green)" }}>
            ${stats.avgWin.toFixed(2)}
          </div>
          <div className="label">{t("dash.journal.avgWin")}</div>
        </div>
        <div className="stat-card">
          <div className="value">{stats.winRate.toFixed(1)}%</div>
          <div className="label">{t("dash.journal.winRatio")}</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: "var(--red)" }}>
            {fmtMoney(stats.avgLoss)}
          </div>
          <div className="label">{t("dash.journal.avgLoss")}</div>
        </div>
        <div className="stat-card">
          <div className="value">{stats.profitFactor.toFixed(2)}</div>
          <div className="label">{t("dash.journal.profitFactor")}</div>
        </div>
      </div>

      <div className="panel-section-title">{t("dash.journal.objectives")}</div>
      <div className="journal-objectives">
        <div className="card journal-rule-card">
          <div className="journal-rule-head">
            <span className="journal-rule-name">
              {t("dash.journal.rule.maxDailyLoss")}
              <Icon name="info" className="journal-rule-info" />
            </span>
            <div className="journal-rule-actions">
              <span className={`journal-rule-status ${dailyLossBreached ? "is-bad" : "is-good"}`}>
                {dailyLossBreached ? t("dash.journal.rule.attention") : t("dash.journal.rule.onTrack")}
              </span>
              <button type="button" className="journal-rule-edit-btn" aria-label={t("common.edit")} onClick={() => startEditLimit("dailyLoss", maxDailyLossLimit)}>
                <Icon name="edit" />
              </button>
            </div>
          </div>
          {editingLimit === "dailyLoss" ? (
            <div className="journal-limit-editor">
              <span className="journal-limit-prefix">$</span>
              <input
                type="number"
                className="journal-limit-input"
                value={draftLimit}
                onChange={(e) => setDraftLimit(e.target.value)}
                autoFocus
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEditLimit}>
                {t("common.cancel")}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => saveLimit("dailyLoss")}>
                {t("common.confirm")}
              </button>
            </div>
          ) : (
            <>
              <div className="journal-rule-meta">
                <span>{t("dash.journal.rule.worstDay", { v: fmtMoney(worstDay) })}</span>
                <span>{t("dash.journal.rule.allowedDaily", { v: `-$${maxDailyLossLimit.toFixed(2)}` })}</span>
              </div>
              <div className="journal-progress-track">
                <span
                  className={`journal-progress-fill ${dailyLossBreached ? "is-bad" : ""}`}
                  style={{ width: `${Math.min(100, (Math.abs(worstDay) / maxDailyLossLimit) * 100)}%` }}
                />
              </div>
            </>
          )}
        </div>

        <div className="card journal-rule-card">
          <div className="journal-rule-head">
            <span className="journal-rule-name">
              {t("dash.journal.rule.maxLoss")}
              <Icon name="info" className="journal-rule-info" />
            </span>
            <div className="journal-rule-actions">
              <span className="journal-rule-status is-neutral">{t("dash.journal.rule.remaining", { v: fmtMoney(maxLossLimit - lossUsed) })}</span>
              <button type="button" className="journal-rule-edit-btn" aria-label={t("common.edit")} onClick={() => startEditLimit("maxLoss", maxLossLimit)}>
                <Icon name="edit" />
              </button>
            </div>
          </div>
          {editingLimit === "maxLoss" ? (
            <div className="journal-limit-editor">
              <span className="journal-limit-prefix">$</span>
              <input
                type="number"
                className="journal-limit-input"
                value={draftLimit}
                onChange={(e) => setDraftLimit(e.target.value)}
                autoFocus
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEditLimit}>
                {t("common.cancel")}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => saveLimit("maxLoss")}>
                {t("common.confirm")}
              </button>
            </div>
          ) : (
            <>
              <div className="journal-rule-meta">
                <span>{t("dash.journal.rule.allowedLoss", { v: `$${maxLossLimit.toFixed(2)}` })}</span>
              </div>
              <div className="journal-progress-track">
                <span
                  className={`journal-progress-fill ${lossUsed / maxLossLimit > 0.8 ? "is-bad" : ""}`}
                  style={{ width: `${Math.min(100, (lossUsed / maxLossLimit) * 100)}%` }}
                />
              </div>
            </>
          )}
        </div>

        <div className="card journal-rule-card">
          <div className="journal-rule-head">
            <span className="journal-rule-name">
              {t("dash.journal.rule.profitTarget")}
              <Icon name="info" className="journal-rule-info" />
            </span>
            <div className="journal-rule-actions">
              <span className="journal-rule-status is-neutral">{t("dash.journal.rule.progress", { pct: Math.round((profitProgress / profitTarget) * 100) })}</span>
              <button type="button" className="journal-rule-edit-btn" aria-label={t("common.edit")} onClick={() => startEditLimit("profitTarget", profitTarget)}>
                <Icon name="edit" />
              </button>
            </div>
          </div>
          {editingLimit === "profitTarget" ? (
            <div className="journal-limit-editor">
              <span className="journal-limit-prefix">$</span>
              <input
                type="number"
                className="journal-limit-input"
                value={draftLimit}
                onChange={(e) => setDraftLimit(e.target.value)}
                autoFocus
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEditLimit}>
                {t("common.cancel")}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => saveLimit("profitTarget")}>
                {t("common.confirm")}
              </button>
            </div>
          ) : (
            <>
              <div className="journal-rule-meta">
                <span>{t("dash.journal.rule.profitAchieved", { achieved: `$${profitProgress.toFixed(2)}`, target: `$${profitTarget.toFixed(2)}` })}</span>
              </div>
              <div className="journal-progress-track">
                <span className="journal-progress-fill" style={{ width: `${Math.min(100, (profitProgress / profitTarget) * 100)}%` }} />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card journal-calendar-card">
        <div className="journal-calendar-head">
          <span className="panel-section-title" style={{ margin: 0 }}>
            {t("dash.journal.dailySummary")}
          </span>
          <div className="journal-calendar-nav">
            <button type="button" className="journal-cal-btn" onClick={() => changeMonth(-1)}>
              <Icon name="chevron_left" />
            </button>
            <span className="journal-cal-month">{monthLabel}</span>
            <button type="button" className="journal-cal-btn" onClick={() => changeMonth(1)}>
              <Icon name="chevron_right" />
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setViewYear(2025); setViewMonth(10); }}>
              {t("dash.journal.today")}
            </button>
          </div>
          <div className="journal-calendar-summary">
            {t("dash.journal.numberOfDays")}: <b style={{ color: "var(--red)" }}>{fmtMoney(stats.totalPnl)}</b> | {t("dash.journal.days")}: <b>{stats.days}</b>
          </div>
        </div>

        <div className="journal-calendar-grid">
          <div className="journal-calendar-cols">
            {DOW.map((d) => (
              <div className="journal-cal-dow" key={d}>
                {d}
              </div>
            ))}
            <div className="journal-cal-dow journal-cal-weekly-label">{t("dash.journal.weekN", { n: "" }).replace(/\s*$/, "")}</div>
          </div>
          {weeks.map((week, wi) => {
            const weekPnl = week.reduce((s: number, day) => {
              if (!day) return s;
              const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              return s + (byDay.get(iso)?.pnl ?? 0);
            }, 0);
            const weekDays = week.filter((day) => {
              if (!day) return false;
              const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              return byDay.has(iso);
            }).length;
            const firstDay = week.find((d) => d !== null);
            const lastDay = [...week].reverse().find((d) => d !== null);
            return (
              <div className="journal-cal-week-row" key={wi}>
                {week.map((day, di) => {
                  if (!day) return <div className="journal-cal-cell is-empty" key={di} />;
                  const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const info = byDay.get(iso);
                  return (
                    <div className="journal-cal-cell" key={di}>
                      <span className="n">{day}</span>
                      {info && (
                        <div className="journal-cal-info">
                          <span className="count">
                            {info.count} <Icon name="sync_alt" />
                          </span>
                          <span className={info.pnl >= 0 ? "pnl is-pos" : "pnl is-neg"}>{fmtMoney(info.pnl)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="journal-cal-week-summary">
                  <div className="journal-week-title">
                    {t("dash.journal.weekN", { n: wi + 1 })}
                    <span className="journal-week-range">
                      {firstDay && lastDay ? `${monthLabel.split(" ")[0].slice(0, 3)} ${firstDay} - ${lastDay}` : ""}
                    </span>
                  </div>
                  {weekDays > 0 ? (
                    <div className="journal-week-stats">
                      {t("dash.journal.profit")}: <b className={weekPnl >= 0 ? "is-pos" : "is-neg"}>{fmtMoney(weekPnl)}</b>
                      &nbsp;| {t("dash.journal.days")}: <b>{weekDays}</b>
                    </div>
                  ) : (
                    <div className="journal-week-empty">{t("dash.journal.noTrades")}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="stat-grid cols-3" style={{ margin: "20px 0" }}>
        <div className="stat-card">
          <div className="value">{stats.totalLots.toFixed(2)}</div>
          <div className="label">{t("dash.journal.totalLots")}</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: "var(--green)" }}>
            ${stats.biggestWin.toFixed(2)}
          </div>
          <div className="label">{t("dash.journal.biggestWin")}</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: "var(--red)" }}>
            {fmtMoney(stats.biggestLoss)}
          </div>
          <div className="label">{t("dash.journal.biggestLoss")}</div>
        </div>
      </div>

      <div className="journal-gauge-row">
        {[
          { title: t("dash.journal.shortAnalysis"), s: stats.short },
          { title: t("dash.journal.profitability"), s: { profit: stats.totalPnl, wins: stats.totalTrades - stats.long.losses - stats.short.losses, losses: stats.long.losses + stats.short.losses, winAmount: 0, lossAmount: 0, winRate: stats.winRate } },
          { title: t("dash.journal.longAnalysis"), s: stats.long },
        ].map((g, i) => (
          <div className="card journal-gauge-card" key={i}>
            <div className="panel-section-title">{g.title}</div>
            <Gauge winPct={g.s.winRate} />
            <div className="journal-gauge-center">
              <span className="l">{i === 1 ? t("dash.journal.totalTrades").replace(" Taken", "") : t("dash.journal.profit")}</span>
              <span className={`v ${g.s.profit >= 0 ? "is-pos" : "is-neg"}`}>{i === 1 ? stats.totalTrades : fmtMoney(g.s.profit)}</span>
            </div>
            <div className="journal-gauge-foot">
              {i === 1 ? (
                <>
                  <span>
                    {g.s.winRate.toFixed(2)}%<br />
                    <b>{t("dash.journal.wins", { n: g.s.wins })}</b>
                  </span>
                  <span>
                    {(100 - g.s.winRate).toFixed(2)}%<br />
                    <b>{t("dash.journal.losses", { n: g.s.losses })}</b>
                  </span>
                </>
              ) : (
                <>
                  <span>
                    {t("dash.journal.wins", { n: g.s.wins })}
                    <br />${g.s.winAmount.toFixed(2)}
                  </span>
                  <span>
                    {t("dash.journal.winRate")}
                    <br />
                    {g.s.winRate.toFixed(0)}%
                  </span>
                  <span>
                    {t("dash.journal.losses", { n: g.s.losses })}
                    <br />${g.s.lossAmount.toFixed(2)}
                  </span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="journal-table-tabs">
          <button type="button" className={`journal-table-tab${tab === "history" ? " is-active" : ""}`} onClick={() => setTab("history")}>
            {t("dash.journal.tradingHistory")}
          </button>
          <button type="button" className={`journal-table-tab${tab === "open" ? " is-active" : ""}`} onClick={() => setTab("open")}>
            {t("dash.journal.openPositions")}
          </button>
        </div>
        {tab === "history" ? (
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 960 }}>
              <thead>
                <tr>
                  <th>{t("dash.journal.col.symbol")}</th>
                  <th>{t("dash.journal.col.type")}</th>
                  <th>{t("dash.journal.col.openDate")}</th>
                  <th>{t("dash.journal.col.open")}</th>
                  <th>{t("dash.journal.col.closedDate")}</th>
                  <th>{t("dash.journal.col.closed")}</th>
                  <th>{t("dash.journal.col.tp")}</th>
                  <th>{t("dash.journal.col.sl")}</th>
                  <th>{t("dash.journal.col.lots")}</th>
                  <th>{t("dash.journal.col.pnl")}</th>
                  <th>{t("dash.journal.col.note")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedTrades.map((trade) => {
                  const note = notes[trade.id];
                  const tags = tradeTags[trade.id] ?? [];
                  const isEditing = editingNoteId === trade.id;
                  return (
                    <Fragment key={trade.id}>
                      <tr>
                        <td>{trade.symbol}</td>
                        <td className={trade.side === "buy" ? "journal-side-buy" : "journal-side-sell"}>
                          {trade.side === "buy" ? t("dash.journal.buy") : t("dash.journal.sell")}
                        </td>
                        <td>{fmtDateTime(trade.openDate)}</td>
                        <td>{trade.openPrice.toFixed(2)}</td>
                        <td>{fmtDateTime(trade.closeDate)}</td>
                        <td>{trade.closePrice.toFixed(2)}</td>
                        <td>{trade.tp ? trade.tp.toFixed(2) : "-"}</td>
                        <td>{trade.sl ? trade.sl.toFixed(2) : "-"}</td>
                        <td>{trade.lots.toFixed(2)}</td>
                        <td style={{ color: trade.pnl >= 0 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{fmtMoney(trade.pnl)}</td>
                        <td>
                          <div className="journal-note-cell">
                            {tags.length > 0 && (
                              <div className="journal-note-tags">
                                {tags.map((tag) => (
                                  <span key={tag} className="journal-tag-chip">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            {note ? (
                              <button type="button" className="journal-note-btn has-note" onClick={() => startEditNote(trade)}>
                                <Icon name="sticky_note_2" />
                                <span className="journal-note-preview">{note}</span>
                              </button>
                            ) : (
                              <button type="button" className="journal-note-btn" onClick={() => startEditNote(trade)}>
                                <Icon name="add_circle" />
                                {t("dash.journal.note.add")}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isEditing && (
                        <tr className="journal-note-edit-row">
                          <td colSpan={11}>
                            <div className="journal-note-editor">
                              <div className="journal-note-tag-picker">
                                <span className="journal-note-tag-label">{t("dash.journal.note.tagsLabel")}</span>
                                <div className="journal-note-tag-options">
                                  {TRADE_TAGS.map((tag) => (
                                    <button
                                      key={tag}
                                      type="button"
                                      className={`journal-tag-chip is-selectable${draftTags.includes(tag) ? " is-active" : ""}`}
                                      onClick={() => toggleDraftTag(tag)}
                                    >
                                      {tag}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <textarea
                                className="journal-note-textarea"
                                placeholder={t("dash.journal.note.placeholder")}
                                value={draftNote}
                                onChange={(e) => setDraftNote(e.target.value)}
                                autoFocus
                              />
                              <div className="journal-note-actions">
                                <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEditNote}>
                                  {t("common.cancel")}
                                </button>
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => saveNote(trade.id)}>
                                  {t("common.save")}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-empty" style={{ padding: 32 }}>
            {t("dash.journal.noOpenPositions")}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
