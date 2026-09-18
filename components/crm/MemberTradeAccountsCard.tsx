"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  useCrm,
  fetchRealAccountLots,
  memberTradeAccounts,
  memberLotRange,
  verificationBadgeClass,
  verificationLabelKey,
  lot,
  type Member,
  type TradeAccount,
} from "./CrmContext";
import { useLanguage } from "./LanguageContext";
import Icon from "../Icon";
import Drawer from "./Drawer";
import TradeAccountForm, { type TradeAccountFormHandle } from "./TradeAccountForm";
import TradeAccountHistoryPanel from "./TradeAccountHistoryPanel";
import SummaryTotalBar from "./SummaryTotalBar";
import DateRangePicker from "./DateRangePicker";

export default function MemberTradeAccountsCard({ member }: { member: Member }) {
  const { tradeAccounts, brokers, lotSummaries } = useCrm();
  const { t } = useLanguage();
  const accounts = memberTradeAccounts(member.id, tradeAccounts);
  const summary = lotSummaries[member.id];
  const [range, setDateRange] = useState(() => memberLotRange(member));
  const [customRange, setCustomRange] = useState(false);
  const [lotsByAccount, setLotsByAccount] = useState<Record<number, number | null>>({});
  // Member-level breakdown (all active accounts) fetched ONCE for the current
  // cycle — no N+1 live calls on mount. A custom date range still falls back
  // to per-account live lookups below.
  const [breakdown, setBreakdown] = useState<{ window: { from: string; to: string }; byTradeId: Record<string, number> } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<{ account: TradeAccount | null } | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const formRef = useRef<TradeAccountFormHandle>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBreakdown(null);
    fetch(`/api/crm/members/${member.id}/lots/?period=cycle`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as {
          ok?: boolean;
          window?: { from: string; to: string };
          byAccount?: Array<{ accountId: number; tradeId: string; lots: number }>;
        };
        if (!cancelled && response.ok && payload.ok && payload.window && payload.byAccount) {
          setBreakdown({
            window: payload.window,
            byTradeId: Object.fromEntries(payload.byAccount.map((row) => [row.tradeId.trim(), row.lots])),
          });
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [member.id]);

  const breakdownActive = breakdown !== null && !customRange &&
    breakdown.window.from === range.from && breakdown.window.to === range.to;

  // Per-account live lots, straight from the CRM lot-check webhook — only for
  // a custom date range. The default cycle view reads the one-shot breakdown
  // above instead. A failed lookup stays null (rendered as "—"), never a fake zero.
  useEffect(() => {
    if (!breakdownActive) {
      let cancelled = false;
      // Reset to the loading state ("…" cells) before refetching.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLotsByAccount({});
      Promise.all(accounts.map(async (a) => [a.id, await fetchRealAccountLots(a.tradeId, range).catch(() => null)] as const))
        .then((pairs) => { if (!cancelled) setLotsByAccount(Object.fromEntries(pairs)); });
      return () => { cancelled = true; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdownActive, accounts.map((a) => a.tradeId).join(","), range.from, range.to]);

  function lotsFor(account: TradeAccount): number | null | undefined {
    if (breakdownActive && breakdown) {
      const lots = breakdown.byTradeId[account.tradeId.trim()];
      return lots ?? 0;
    }
    return lotsByAccount[account.id];
  }

  const loaded = breakdownActive || accounts.every((a) => lotsByAccount[a.id] !== undefined);
  const anyFailed = !breakdownActive && accounts.some((a) => lotsByAccount[a.id] === null);
  const totalLots = breakdownActive && breakdown
    ? accounts.reduce((s, a) => s + (breakdown.byTradeId[a.tradeId.trim()] ?? 0), 0)
    : loaded && !anyFailed
      ? accounts.reduce((s, a) => s + (lotsByAccount[a.id] || 0), 0)
      : null;
  const cycleWindowLabel = summary && !customRange ? `${summary.from} – ${summary.to}` : null;

  function toggleExpand(id: number) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div className="panel-section-title" style={{ margin: 0 }}>
            {t("members.section.tradeAccounts")} ({accounts.length})
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {cycleWindowLabel && (
              <span className="mono" style={{ fontSize: 12, color: "var(--text-sub)" }}>{cycleWindowLabel}</span>
            )}
            <DateRangePicker
              value={range}
              onChange={(next) => { setDateRange(next); setCustomRange(true); }}
              placeholder={t("ta.history.selectRange")}
            />
            <button className="btn btn-ghost" onClick={() => setDrawerOpen({ account: null })}>
              <Icon name="add" />
              {t("ta.addTradeAccount")}
            </button>
          </div>
        </div>
        {accounts.length > 0 && totalLots !== null && <SummaryTotalBar label={t("ta.history.total")} lots={totalLots} rebate={0} style={{ marginBottom: 14 }} />}
        {accounts.length > 0 && totalLots === null && loaded && (
          <div style={{ fontSize: 12.5, color: "var(--text-sub)", marginBottom: 14 }}>{t("ta.history.liveUnavailable")}</div>
        )}
        {accounts.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("ta.col.broker")}</th>
                  <th>{t("ta.col.tradeId")}</th>
                  <th>{t("ta.col.accountType")}</th>
                  <th>{t("ta.col.verification")}</th>
                  <th>{t("ta.col.lots")}</th>
                  <th>{t("ta.col.rebate")}</th>
                  <th>{t("ta.col.status")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const isOpen = expanded.has(a.id);
                  const liveLots = lotsFor(a);
                  return (
                    <Fragment key={a.id}>
                      <tr onClick={() => toggleExpand(a.id)} style={{ cursor: "pointer" }}>
                        <td>
                          <button
                            className={`expand-btn${isOpen ? " open" : ""}`}
                            data-noopen
                            aria-label={`Show trade history for ${a.tradeId}`}
                            aria-expanded={isOpen}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(a.id);
                            }}
                          >
                            <Icon name="chevron_right" />
                          </button>
                          {brokers.find((b) => b.id === a.brokerId)?.name ?? "—"}
                        </td>
                        <td className="mono">
                          {a.tradeId}
                          {a.duplicateTradeId && (
                            <span className="badge suspended" style={{ marginLeft: 8 }} title={t("members.duplicateTradeId")}>
                              <Icon name="warning" style={{ fontSize: 13 }} />
                              {t("members.duplicate")}
                            </span>
                          )}
                        </td>
                        <td>{a.accountType || "—"}</td>
                        <td>
                          <span className={`badge ${verificationBadgeClass(a.verification)}`}>{t(verificationLabelKey(a.verification))}</span>
                        </td>
                        <td className="mono">{liveLots === undefined ? "…" : liveLots === null ? "—" : lot(liveLots)}</td>
                        <td className="mono">$0.00</td>
                        <td>
                          <span className={`badge ${a.status === "active" ? "active" : "suspended"}`}>{a.status === "active" ? t("common.active") : t("common.inactive")}</span>
                        </td>
                        <td className="row-actions" data-noopen>
                          <button className="kebab" aria-label="Edit" onClick={(e) => { e.stopPropagation(); setDrawerOpen({ account: a }); }}>
                            <Icon name="edit" />
                          </button>
                        </td>
                      </tr>
                      <tr className="cust-sub" hidden={!isOpen}>
                        <td></td>
                        <td colSpan={7}>
                          <TradeAccountHistoryPanel accountId={a.id} tradeId={a.tradeId} range={range} />
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--text-sub)" }}>{t("members.noTradeAccounts")}</div>
        )}
      </div>

      <Drawer
        open={!!drawerOpen}
        title={drawerOpen?.account ? t("ta.drawer.edit") : t("ta.drawer.add")}
        onClose={() => setDrawerOpen(null)}
        body={drawerOpen ? <TradeAccountForm ref={formRef} account={drawerOpen.account} defaultMemberId={member.id} onDone={() => setDrawerOpen(null)} /> : null}
        foot={
          drawerOpen && (
            <>
              <button className="btn btn-ghost" onClick={() => setDrawerOpen(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={() => formRef.current?.save()}>
                {drawerOpen.account ? t("common.saveChanges") : t("ta.addTradeAccount")}
              </button>
            </>
          )
        }
      />
    </>
  );
}
