"use client";

import { Fragment, useRef, useState } from "react";
import {
  useCrm,
  accountLots,
  accountRebate,
  memberTradeAccounts,
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

function currentMonthRange() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay)}` };
}

export default function MemberTradeAccountsCard({ member }: { member: Member }) {
  const { tradeAccounts, tradeLogs, brokers } = useCrm();
  const { t } = useLanguage();
  const accounts = memberTradeAccounts(member.id, tradeAccounts);
  const [range, setDateRange] = useState(currentMonthRange);
  const totalLots = accounts.reduce((s, a) => s + accountLots(a.id, tradeLogs, range), 0);
  const totalRebate = accounts.reduce((s, a) => s + accountRebate(a.id, tradeLogs, range), 0);
  const [drawerOpen, setDrawerOpen] = useState<{ account: TradeAccount | null } | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const formRef = useRef<TradeAccountFormHandle>(null);

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
        {accounts.length > 0 && <SummaryTotalBar label={t("ta.history.total")} lots={totalLots} rebate={totalRebate} style={{ marginBottom: 14 }} />}
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
                        <td className="mono">{lot(accountLots(a.id, tradeLogs, range))}</td>
                        <td className="mono">${accountRebate(a.id, tradeLogs, range).toFixed(2)}</td>
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
                          <TradeAccountHistoryPanel accountId={a.id} />
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
