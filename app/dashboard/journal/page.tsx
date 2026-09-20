"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { useCrm, displayNameOf } from "../../../components/crm/CrmContext";
import { useCustomerData } from "../../../components/dashboard/useCustomerData";
import Icon from "../../../components/Icon";
import Drawer from "../../../components/crm/Drawer";
import { apiCall } from "../../../lib/crmApi";
import {
  INITIAL_ACCOUNTS, TRADE_TAGS, journalStats, tradesByDay, balanceSeries,
  type JournalAccount, type JournalTrade, type JournalAccountDto, type RiskRuleDto,
} from "../../../lib/journal";
import JournalTradeForm, { formToBody, tradeToForm, type TradeFormData } from "../../../components/dashboard/JournalTradeForm";
import JournalImportModal from "../../../components/dashboard/JournalImportModal";
import JournalInsights from "../../../components/dashboard/JournalInsights";
import JournalLivePositions from "../../../components/dashboard/JournalLivePositions";
import { exportCsv } from "../../../lib/exportCsv";

function fmtMoney(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(iso: string) {
  if (!iso) return "—";
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
  const values = [startBalance, ...bal.map((p) => p.balance)];
  const min = Math.min(...values) - 10;
  const max = Math.max(...values) + 10;
  const w = 900;
  const h = 220;
  const n = bal.length || 1;
  const xAt = (i: number) => (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const yAt = (v: number) => h - ((v - min) / (max - min)) * h;

  const balPath = bal.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(p.balance)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="journal-line-svg" preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={0} x2={w} y1={h * f} y2={h * f} className="journal-line-grid" />
      ))}
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

function dtoToAccount(dto: JournalAccountDto): JournalAccount {
  return {
    id: String(dto.id),
    accountId: dto.id,
    tradeAccountId: dto.tradeAccountId,
    createdDate: dto.createdDate,
    broker: dto.broker,
    accountType: dto.accountType,
    platform: dto.platform,
    size: dto.startingBalance,
    startDate: dto.startDate,
    mtServer: dto.mtServer,
    hasInvestorPassword: dto.hasInvestorPassword,
    mtLastSyncAt: dto.mtLastSyncAt,
    trades: [],
  };
}

const DEFAULT_RULES: RiskRuleDto = { maxDailyLoss: 250, maxLoss: 500, profitTarget: 400 };

export default function TradingJournalPage() {
  const { t, lang } = useLanguage();
  const { toast } = useCrm();
  const { member, brokerFor } = useCustomerData();
  const { tradeAccounts } = useCrm();

  const [accounts, setAccounts] = useState<JournalAccount[]>(INITIAL_ACCOUNTS);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [tradesCache, setTradesCache] = useState<Record<number, JournalTrade[]>>({});
  const [rulesCache, setRulesCache] = useState<Record<number, RiskRuleDto>>({});
  const [loading, setLoading] = useState(true);
  const [tradesLoading, setTradesLoading] = useState(false);

  const account = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0];
  const dbId = account?.accountId;
  const trades = useMemo(() => (dbId != null && tradesCache[dbId]) || [], [dbId, tradesCache]);
  const rules = useMemo(() => (dbId != null && rulesCache[dbId]) || DEFAULT_RULES, [dbId, rulesCache]);

  const closedTrades = useMemo(() => trades.filter((trade) => trade.closeDate), [trades]);
  const openTrades = useMemo(() => trades.filter((trade) => !trade.closeDate), [trades]);

  const loadAccounts = useCallback(async () => {
    try {
      const payload = await apiCall<{ accounts: JournalAccountDto[] }>("/api/me/journal/accounts/", "GET");
      const next = payload.accounts.map(dtoToAccount);
      setAccounts(next);
      setSelectedAccountId((cur) => (next.some((a) => a.id === cur) ? cur : (next[0]?.id ?? "")));
    } catch {
      // Journal stays empty rather than fake.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const loadTrades = useCallback(async (id: number) => {
    setTradesLoading(true);
    try {
      const [tradesPayload, rulesPayload] = await Promise.all([
        apiCall<{ trades: JournalTrade[] }>(`/api/me/journal/accounts/${id}/trades/`, "GET"),
        apiCall<{ rules: RiskRuleDto }>(`/api/me/journal/accounts/${id}/rules/`, "GET"),
      ]);
      setTradesCache((cur) => ({ ...cur, [id]: tradesPayload.trades }));
      setRulesCache((cur) => ({ ...cur, [id]: rulesPayload.rules }));
    } catch {
      // keep previous data
    } finally {
      setTradesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dbId == null) return;
    if (tradesCache[dbId] !== undefined) return;
    void loadTrades(dbId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbId]);

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

  const linkedIds = useMemo(() => new Set(accounts.map((a) => a.tradeAccountId).filter((id): id is number => id != null)), [accounts]);
  const availableTradeAccounts = useMemo(
    () => tradeAccounts.filter((a) => a.status === "active" && !linkedIds.has(a.id)),
    [tradeAccounts, linkedIds],
  );

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [selectedTradeId, setSelectedTradeId] = useState("");
  const [newPlatform, setNewPlatform] = useState("MetaTrader 5");
  const [newSize, setNewSize] = useState("1000");
  const [newMtServer, setNewMtServer] = useState("");
  const [newInvestorPassword, setNewInvestorPassword] = useState("");
  const [linking, setLinking] = useState(false);

  const effectiveTradeId = selectedTradeId || availableTradeAccounts[0]?.tradeId || "";
  const pickedRegisteredAccount = availableTradeAccounts.find((a) => a.tradeId === effectiveTradeId);

  function openAddAccount() {
    setSelectedTradeId("");
    setNewMtServer("");
    setNewInvestorPassword("");
    setShowAddAccount(true);
  }

  async function addAccount() {
    const size = parseFloat(newSize);
    if (!pickedRegisteredAccount || !Number.isFinite(size) || size <= 0 || linking) return;
    setLinking(true);
    try {
      const payload = await apiCall<{ account: JournalAccountDto }>("/api/me/journal/accounts/", "POST", {
        tradeAccountId: pickedRegisteredAccount.id,
        platform: newPlatform,
        startingBalance: size,
        mtServer: newMtServer.trim() || undefined,
        investorPassword: newInvestorPassword || undefined,
      });
      const acc = dtoToAccount(payload.account);
      setAccounts((cur) => [...cur, acc]);
      setSelectedAccountId(acc.id);
      setShowAddAccount(false);
      setNewSize("1000");
      setNewMtServer("");
      setNewInvestorPassword("");
      toast(t("dash.journal.account.added"));
    } catch (addError) {
      toast(addError instanceof Error ? addError.message : t("dash.journal.account.linkFailed"));
    } finally {
      setLinking(false);
    }
  }

  async function deleteAccount() {
    if (dbId == null || !window.confirm(t("dash.journal.account.removeConfirm"))) return;
    try {
      await apiCall(`/api/me/journal/accounts/${dbId}/`, "DELETE");
      setAccounts((cur) => cur.filter((a) => a.id !== String(dbId)));
      setSelectedAccountId("");
      toast(t("dash.journal.account.removed"));
    } catch (deleteError) {
      toast(deleteError instanceof Error ? deleteError.message : t("dash.journal.account.removeFailed"));
    }
  }

  const accountPreviews = useMemo(
    () =>
      accounts.map((acc) => {
        const rows = (acc.accountId != null && tradesCache[acc.accountId]) || [];
        const closed = rows.filter((trade) => trade.closeDate);
        const s = journalStats(closed);
        const { current } = balanceSeries(closed, acc.size);
        return { id: acc.id, balance: current, pnl: s.totalPnl, pnlPct: acc.size ? (s.totalPnl / acc.size) * 100 : 0 };
      }),
    [accounts, tradesCache],
  );

  const [tab, setTab] = useState<"history" | "open">("history");
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [tradeDrawer, setTradeDrawer] = useState<{ mode: "add" } | { mode: "edit"; trade: JournalTrade } | null>(null);
  const [drawerAccountId, setDrawerAccountId] = useState<number | null>(null);
  const [tradeSaving, setTradeSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [mtGuideOpen, setMtGuideOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function openAddTrade() {
    setDrawerAccountId(dbId ?? null);
    setTradeDrawer({ mode: "add" });
  }

  function startEditNote(trade: JournalTrade) {
    setEditingNoteId(trade.id);
    setDraftNote(trade.note ?? "");
    setDraftTags(trade.tags ?? []);
  }

  function toggleDraftTag(tag: string) {
    setDraftTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));
  }

  async function saveNote(id: number) {
    if (dbId == null) return;
    try {
      const payload = await apiCall<{ trade: JournalTrade }>(`/api/me/journal/trades/${id}/`, "PATCH", {
        note: draftNote.trim() || null,
        tags: draftTags,
      });
      setTradesCache((cur) => ({ ...cur, [dbId]: (cur[dbId] ?? []).map((row) => (row.id === id ? payload.trade : row)) }));
      setEditingNoteId(null);
      toast(t("dash.journal.note.saved"));
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : t("dash.journal.note.saveFailed"));
    }
  }

  function cancelEditNote() {
    setEditingNoteId(null);
  }

  async function saveTrade(form: TradeFormData) {
    if (tradeSaving) return;
    setTradeSaving(true);
    try {
      const body = formToBody(form);
      if (tradeDrawer?.mode === "edit") {
        const targetId = tradeDrawer.trade.accountId ?? dbId;
        if (targetId == null) return;
        const payload = await apiCall<{ trade: JournalTrade }>(`/api/me/journal/trades/${tradeDrawer.trade.id}/`, "PATCH", body);
        setTradesCache((cur) => ({ ...cur, [targetId]: (cur[targetId] ?? []).map((row) => (row.id === payload.trade.id ? payload.trade : row)) }));
        toast(t("dash.journal.trade.saved"));
      } else {
        const targetId = drawerAccountId ?? dbId;
        if (targetId == null) return;
        const payload = await apiCall<{ trade: JournalTrade }>(`/api/me/journal/accounts/${targetId}/trades/`, "POST", body);
        setTradesCache((cur) => ({ ...cur, [targetId]: [payload.trade, ...(cur[targetId] ?? [])] }));
        toast(t("dash.journal.trade.added"));
      }
      setTradeDrawer(null);
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : t("dash.journal.trade.saveFailed"));
    } finally {
      setTradeSaving(false);
    }
  }

  async function deleteTrade(id: number) {
    if (dbId == null || !window.confirm(t("dash.journal.trade.removeConfirm"))) return;
    try {
      await apiCall(`/api/me/journal/trades/${id}/`, "DELETE");
      setTradesCache((cur) => ({ ...cur, [dbId]: (cur[dbId] ?? []).filter((row) => row.id !== id) }));
      toast(t("dash.journal.trade.removed"));
    } catch (deleteError) {
      toast(deleteError instanceof Error ? deleteError.message : t("dash.journal.trade.removeFailed"));
    }
  }

  const stats = useMemo(() => journalStats(closedTrades), [closedTrades]);
  const byDay = useMemo(() => tradesByDay(closedTrades), [closedTrades]);
  const { max: maxBalance, current: currentBalance } = useMemo(() => balanceSeries(closedTrades, account?.size ?? 0), [closedTrades, account]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const todaysProfit = byDay.get(todayIso)?.pnl ?? 0;

  const worstDay = Math.min(0, ...Array.from(byDay.values()).map((d) => d.pnl));
  const maxDailyLossLimit = rules.maxDailyLoss;
  const dailyLossBreached = Math.abs(worstDay) > maxDailyLossLimit;
  const maxLossLimit = rules.maxLoss;
  const lossUsed = Math.max(0, -stats.totalPnl);
  const profitTarget = rules.profitTarget;
  const profitProgress = Math.max(0, stats.totalPnl);

  const slUsage = closedTrades.length ? closedTrades.filter((trade) => trade.sl != null).length / closedTrades.length : 0;
  const consistency = Math.min(1, stats.days / 20);
  const rrValue = Math.min(1, stats.profitFactor / 5);

  const [editingLimit, setEditingLimit] = useState<LimitKey | null>(null);
  const [draftLimit, setDraftLimit] = useState("");

  function startEditLimit(key: LimitKey, current: number) {
    setEditingLimit(key);
    setDraftLimit(String(current));
  }

  function cancelEditLimit() {
    setEditingLimit(null);
  }

  async function saveLimit(key: LimitKey) {
    if (dbId == null) return;
    const val = Math.abs(parseFloat(draftLimit));
    if (!Number.isFinite(val) || val <= 0) {
      setEditingLimit(null);
      return;
    }
    try {
      const payload = await apiCall<{ rules: RiskRuleDto }>(`/api/me/journal/accounts/${dbId}/rules/`, "PUT", { [key]: val });
      setRulesCache((cur) => ({ ...cur, [dbId]: payload.rules }));
      toast(t("dash.journal.rule.limitSaved"));
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : t("dash.journal.rule.limitFailed"));
    } finally {
      setEditingLimit(null);
    }
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

  function goToday() {
    const current = new Date();
    setViewYear(current.getFullYear());
    setViewMonth(current.getMonth());
  }

  const sortedTrades = useMemo(() => [...closedTrades].sort((a, b) => b.closeDate.localeCompare(a.closeDate)), [closedTrades]);

  if (loading) {
    return (
      <div className="journal-layout">
        <div className="card" style={{ padding: 24 }}>…</div>
      </div>
    );
  }

  if (!account) {
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
                  <div className="field">
                    <label>{t("dash.journal.account.mtServer")}</label>
                    <input
                      className="input mono"
                      value={newMtServer}
                      onChange={(e) => setNewMtServer(e.target.value)}
                      placeholder="XMGlobal-MT5"
                      autoComplete="off"
                    />
                  </div>
                  <div className="field">
                    <label>{t("dash.journal.account.investorPassword")}</label>
                    <input
                      className="input"
                      type="password"
                      value={newInvestorPassword}
                      onChange={(e) => setNewInvestorPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                    <div style={{ fontSize: 11.5, color: "var(--text-sub)", marginTop: 4 }}>
                      {t("dash.journal.account.investorHint")}
                    </div>
                  </div>
                  <div className="journal-add-account-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAddAccount(false)}>
                      {t("common.cancel")}
                    </button>
                    <button type="button" className="btn btn-primary btn-sm" disabled={linking} onClick={() => void addAccount()}>
                      {t("dash.journal.account.create")}
                    </button>
                  </div>
                </>
              ) : (
                <div className="journal-add-account-empty">{t("dash.journal.account.noneRegistered")}</div>
              )}
            </div>
          )}
        </aside>
        <div className="journal-main">
          <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-sub)" }}>
            <Icon name="menu_book" style={{ fontSize: 36 }} />
            <p style={{ marginTop: 8 }}>{t("dash.journal.noAccount")}</p>
          </div>
        </div>
      </div>
    );
  }

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
                  <button type="button" className="btn btn-primary btn-sm" disabled={linking} onClick={() => void addAccount()}>
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
                  {acc.hasInvestorPassword && (
                    <span title={t("dash.journal.account.investorSet")} style={{ marginLeft: 6 }}>🔑</span>
                  )}
                </div>
                <div className="journal-account-card-meta" style={{ fontSize: 11 }}>
                  {acc.mtLastSyncAt
                    ? t("dash.journal.mtsync.lastSync", { when: fmtDateTime(acc.mtLastSyncAt) })
                    : t("dash.journal.mtsync.never")}
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
          <span className="journal-pill">{account.broker}</span>
          <span className="journal-pill">{account.accountType}</span>
          <span className="journal-pill">{account.platform}</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost" style={{ padding: "6px 12px" }} onClick={openAddTrade}>
            <Icon name="add" style={{ fontSize: 15 }} />
            {t("dash.journal.trade.add")}
          </button>
          <button type="button" className="btn btn-ghost" style={{ padding: "6px 12px" }} onClick={() => setImportOpen(true)}>
            <Icon name="upload_file" style={{ fontSize: 15 }} />
            {t("dash.journal.import.btn")}
          </button>
          <button type="button" className="btn btn-ghost" style={{ padding: "6px 12px" }} onClick={() => setMtGuideOpen(true)}>
            <Icon name="sync" style={{ fontSize: 15 }} />
            {t("dash.journal.mtsync.btn")}
          </button>
          <button type="button" className="btn btn-ghost" style={{ padding: "6px 12px" }} onClick={exportTrades}>
            <Icon name="download" style={{ fontSize: 15 }} />
            {t("common.export")}
          </button>
          <button type="button" className="kebab" aria-label={t("common.delete")} title={t("dash.journal.account.remove")} onClick={() => void deleteAccount()}>
            <Icon name="delete" />
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
              { label: t("dash.journal.consistency"), value: consistency },
              { label: t("dash.journal.slUsage"), value: slUsage },
              { label: t("dash.journal.wr"), value: stats.winRate / 100 },
              { label: t("dash.journal.rr"), value: rrValue },
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
            <span className="v">${currentBalance.toFixed(2)}</span>
          </div>
          <div className="journal-equity-track">
            <span className="dot is-equity" />
            <span className="line" />
          </div>
          <div className="journal-equity-max">
            ${maxBalance.toFixed(2)} <span className="max">{t("dash.journal.max")}</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 24, marginTop: 20 }}>
        <div className="panel-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {t("dash.journal.accountBalance")}
        </div>
        <div className="journal-chart-legend">
          <span className="journal-legend-chip is-balance">{t("dash.journal.balance")}</span>
        </div>
        {tradesLoading ? <p className="modal-detail">…</p> : <BalanceChart trades={closedTrades} startBalance={account.size} />}
      </div>

      <div style={{ scrollMarginTop: 12 }}>
        {dbId != null && <JournalInsights key={dbId} accountId={dbId} />}
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
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveLimit("dailyLoss")}>
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
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveLimit("maxLoss")}>
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
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveLimit("profitTarget")}>
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={goToday}>
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
            {t("dash.journal.openPositions")} ({openTrades.length})
          </button>
        </div>
        {tab === "history" ? (
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 1020 }}>
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tradesLoading ? (
                  <tr><td colSpan={12}><div className="table-empty">…</div></td></tr>
                ) : sortedTrades.length ? (
                  sortedTrades.map((trade) => {
                    const tags = trade.tags ?? [];
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
                              {trade.note ? (
                                <button type="button" className="journal-note-btn has-note" onClick={() => startEditNote(trade)}>
                                  <Icon name="sticky_note_2" />
                                  <span className="journal-note-preview">{trade.note}</span>
                                </button>
                              ) : (
                                <button type="button" className="journal-note-btn" onClick={() => startEditNote(trade)}>
                                  <Icon name="add_circle" />
                                  {t("dash.journal.note.add")}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="row-actions">
                            <button type="button" className="kebab" aria-label={t("common.edit")} onClick={() => setTradeDrawer({ mode: "edit", trade })}>
                              <Icon name="edit" />
                            </button>
                            <button type="button" className="kebab" aria-label={t("common.delete")} onClick={() => void deleteTrade(trade.id)}>
                              <Icon name="delete" />
                            </button>
                          </td>
                        </tr>
                        {isEditing && (
                          <tr className="journal-note-edit-row">
                            <td colSpan={12}>
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
                                  <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveNote(trade.id)}>
                                    {t("common.save")}
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                ) : (
                  <tr><td colSpan={12}><div className="table-empty">{t("dash.journal.noTrades")}</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : openTrades.length ? (
          <>
            <JournalLivePositions trades={openTrades} />
            <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="data" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>{t("dash.journal.col.symbol")}</th>
                  <th>{t("dash.journal.col.type")}</th>
                  <th>{t("dash.journal.col.openDate")}</th>
                  <th>{t("dash.journal.col.open")}</th>
                  <th>{t("dash.journal.col.lots")}</th>
                  <th>{t("dash.journal.col.tp")}</th>
                  <th>{t("dash.journal.col.sl")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {openTrades.map((trade) => (
                  <tr key={trade.id}>
                    <td>{trade.symbol}</td>
                    <td className={trade.side === "buy" ? "journal-side-buy" : "journal-side-sell"}>
                      {trade.side === "buy" ? t("dash.journal.buy") : t("dash.journal.sell")}
                    </td>
                    <td>{fmtDateTime(trade.openDate)}</td>
                    <td>{trade.openPrice.toFixed(2)}</td>
                    <td>{trade.lots.toFixed(2)}</td>
                    <td>{trade.tp ? trade.tp.toFixed(2) : "-"}</td>
                    <td>{trade.sl ? trade.sl.toFixed(2) : "-"}</td>
                    <td className="row-actions">
                      <button type="button" className="kebab" aria-label={t("dash.journal.trade.close")} title={t("dash.journal.trade.close")} onClick={() => setTradeDrawer({ mode: "edit", trade })}>
                        <Icon name="check_circle" />
                      </button>
                      <button type="button" className="kebab" aria-label={t("common.delete")} onClick={() => void deleteTrade(trade.id)}>
                        <Icon name="delete" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        ) : (
          <div className="table-empty" style={{ padding: 32 }}>
            {t("dash.journal.noOpenPositions")}
          </div>
        )}
      </div>
      </div>

      <Drawer
        open={tradeDrawer !== null}
        title={tradeDrawer?.mode === "edit" ? t("dash.journal.trade.edit") : t("dash.journal.trade.add")}
        onClose={() => setTradeDrawer(null)}
        body={tradeDrawer ? (
          <>
            {tradeDrawer.mode === "add" && accounts.length > 1 && (
              <div className="field">
                <label>{t("dash.journal.trade.account")}</label>
                <select
                  className="input"
                  value={drawerAccountId ?? dbId ?? ""}
                  onChange={(e) => setDrawerAccountId(Number(e.target.value) || null)}
                >
                  {accounts
                    .filter((acc) => acc.accountId != null)
                    .map((acc) => (
                      <option key={acc.id} value={acc.accountId}>
                        #{acc.id} · {acc.broker}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <JournalTradeForm
              key={tradeDrawer.mode === "edit" ? tradeDrawer.trade.id : `new-${drawerAccountId ?? dbId ?? 0}`}
              initial={tradeToForm(tradeDrawer.mode === "edit" ? tradeDrawer.trade : null)}
              saving={tradeSaving}
              onSave={(form) => void saveTrade(form)}
              onCancel={() => setTradeDrawer(null)}
            />
          </>
        ) : null}
        foot={null}
      />

      <Drawer
        open={importOpen}
        title={t("dash.journal.import.title")}
        onClose={() => setImportOpen(false)}
        body={dbId != null ? (
          <JournalImportModal
            accountId={dbId}
            onClose={() => setImportOpen(false)}
            onImported={(fresh) => {
              setTradesCache((cur) => ({ ...cur, [dbId]: fresh }));
              setImportOpen(false);
              toast(t("dash.journal.import.done", { n: fresh.length }));
            }}
          />
        ) : null}
        foot={null}
      />

      <Drawer
        open={mtGuideOpen}
        title={t("dash.journal.mtsync.title")}
        onClose={() => setMtGuideOpen(false)}
        body={<MtSyncGuide />}
        foot={null}
      />
    </div>
  );

  function MtSyncGuide() {
    const webhook = typeof window !== "undefined" ? `${window.location.origin}/api/mt/journal/sync` : "/api/mt/journal/sync";
    const mtLogin = tradeAccounts.find((a) => a.id === account.tradeAccountId)?.tradeId ?? account.id;
    const steps = [1, 2, 3, 4].map((n) => t(`dash.journal.mtsync.step${n}`));
    return (
      <div>
        <p style={{ fontSize: 13, color: "var(--text-sub)", marginTop: 0 }}>{t("dash.journal.mtsync.intro")}</p>
        <div className="field">
          <label>{t("dash.journal.mtsync.webhook")}</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input mono" readOnly value={webhook} onFocus={(e) => e.target.select()} style={{ fontSize: 12 }} />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                navigator.clipboard?.writeText(webhook).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }).catch(() => undefined);
              }}
            >
              <Icon name={copied ? "check" : "content_copy"} style={{ fontSize: 15 }} />
            </button>
          </div>
        </div>
        <div className="field">
          <label>{t("dash.journal.mtsync.login")}</label>
          <input className="input mono" readOnly value={mtLogin} style={{ fontSize: 12 }} />
        </div>
        <ol style={{ fontSize: 13, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          {steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <a className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} href="/downloads/BeSightJournalSync.mq5" download>
          <Icon name="download" style={{ fontSize: 16 }} />
          {t("dash.journal.mtsync.download")}
        </a>
        <p style={{ fontSize: 12, color: "var(--text-sub)", marginBottom: 0 }}>
          {t("dash.journal.mtsync.investorNote", {
            server: account.mtServer ?? "—",
            status: account.hasInvestorPassword ? t("dash.journal.mtsync.saved") : t("dash.journal.mtsync.notSet"),
          })}
        </p>
      </div>
    );
  }
}
