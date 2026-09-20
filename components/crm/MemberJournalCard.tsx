"use client";

import { useEffect, useState } from "react";
import { fmtDate, lot, type Member } from "./CrmContext";
import { useLanguage } from "./LanguageContext";
import type { JournalAccountDto, JournalTrade, RiskRuleDto } from "../../lib/journal";

type AccountWithRules = JournalAccountDto & { rules: RiskRuleDto };

function fmtMoney(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

/** Read-only journal summary on the member detail page (support view). */
export default function MemberJournalCard({ member }: { member: Member }) {
  const { t } = useLanguage();
  const [accounts, setAccounts] = useState<AccountWithRules[] | null>(null);
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccounts(null);
    fetch(`/api/crm/members/${member.id}/journal/`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; accounts?: AccountWithRules[]; trades?: JournalTrade[] };
        if (!cancelled && response.ok && payload.ok) {
          setAccounts(payload.accounts ?? []);
          setTrades(payload.trades ?? []);
          setFailed(false);
        } else if (!cancelled) {
          setAccounts([]);
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAccounts([]);
          setFailed(true);
        }
      });
    return () => { cancelled = true; };
  }, [member.id]);

  if (accounts === null) {
    return (
      <div className="card" style={{ padding: 20, marginBottom: 16 }} aria-busy="true">
        <span className="skeleton" style={{ width: 170, height: 15, marginBottom: 16 }} />
        <span className="skeleton" style={{ height: 12, marginBottom: 10 }} />
        <span className="skeleton" style={{ width: "70%", height: 12 }} />
      </div>
    );
  }

  const closedPnl = trades.filter((trade) => trade.closeDate).reduce((sum, trade) => sum + trade.pnl, 0);

  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div className="panel-section-title">{t("members.section.journal")}</div>
      {failed && (
        <div style={{ fontSize: 12.5, color: "var(--red)", marginBottom: 8 }}>{t("members.journal.unavailable")}</div>
      )}
      {!accounts.length ? (
        <div style={{ fontSize: 13, color: "var(--text-sub)" }}>{t("members.journal.empty")}</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {accounts.map((account) => (
              <span
                key={account.id}
                className="channel-tag"
                title={`${account.broker} · ${account.platform} · balance $${account.startingBalance.toFixed(2)}`}
              >
                #{account.tradeId} · {account.tradeCount} {t("dash.journal.tradingHistory").toLowerCase()}
              </span>
            ))}
            <span className={`lots ${closedPnl >= 0 ? "met" : "risk"}`} style={{ marginLeft: "auto" }}>
              {fmtMoney(closedPnl)}
            </span>
          </div>
          {!!trades.length && (
            <div className="table-wrap">
              <table className="data" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th>{t("dash.journal.col.symbol")}</th>
                    <th>{t("dash.journal.col.type")}</th>
                    <th>{t("dash.journal.col.closedDate")}</th>
                    <th>{t("dash.journal.col.lots")}</th>
                    <th>{t("dash.journal.col.pnl")}</th>
                    <th>{t("dash.journal.col.note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.slice(0, 20).map((trade) => (
                    <tr key={trade.id}>
                      <td>{trade.symbol}</td>
                      <td>{trade.side}</td>
                      <td className="mono">{trade.closeDate ? fmtDate(trade.closeDate.slice(0, 10)) : t("dash.journal.openPositions")}</td>
                      <td className="mono">{lot(trade.lots)}</td>
                      <td className="mono" style={{ color: trade.pnl >= 0 ? "var(--green)" : "var(--red)" }}>{fmtMoney(trade.pnl)}</td>
                      <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{trade.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
