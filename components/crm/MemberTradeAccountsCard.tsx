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
  const { tradeAccounts, brokers } = useCrm();
  const { t } = useLanguage();
  const accounts = memberTradeAccounts(member.id, tradeAccounts);
  const [range, setDateRange] = useState(() => memberLotRange(member));
  const [lotsByAccount, setLotsByAccount] = useState<Record<number, number | null>>({});
  const [drawerOpen, setDrawerOpen] = useState<{ account: TradeAccount | null } | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const formRef = useRef<TradeAccountFormHandle>(null);

  // Real per-account lots, straight from the CRM lot-check webhook — same
  // source the renewal engine qualifies against, no mock trade-log data.
  // A failed lookup stays null (rendered as "—"), never a fake zero.
  useEffect(() => {
    let cancelled = false;
    // Reset to the loading state ("…" cells) before refetching.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLotsByAccount({});
    Promise.all(accounts.map(async (a) => [a.id, await fetchRealAccountLots(a.tradeId, range).catch(() => null)] as const))
      .then((pairs) => { if (!cancelled) setLotsByAccount(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.map((a) => a.tradeId).join(","), range.from, range.to]);

  const loaded = accounts.every((a) => lotsByAccount[a.id] !== undefined);
  const anyFailed = accounts.some((a) => lotsByAccount[a.id] === null);
  const totalLots = loaded && !anyFailed ? accounts.reduce((s, a) => s + (lotsByAccount[a.id] || 0), 0) : null;

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
            <DateRangePicker value={range} onChange={setDateRange} placeholder={t("ta.history.selectRange")} />
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
                  const liveLots = lotsByAccount[a.id];
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
                        <td className="mono">{a.tradeId}</td>
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
