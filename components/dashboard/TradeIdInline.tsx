"use client";

import { useState } from "react";
import { useCrm } from "../crm/CrmContext";
import { useLanguage } from "../crm/LanguageContext";
import { useCustomerData } from "./useCustomerData";
import VerifyResultModal, { type VerifyResult } from "../crm/VerifyResultModal";
import Icon from "../Icon";

/** Inline "type it and go" replacement for the old Add/Verify Trade ID
 *  drawer — the Trade ID field (and broker picker) is always visible right
 *  next to its own submit button instead of hiding behind a button that
 *  first opens a drawer. */
const SUPPORTED_BROKER_NAMES = ["XM", "Exness"];

export default function TradeIdInline() {
  const { t } = useLanguage();
  const { brokers, tradeAccounts, setTradeAccounts } = useCrm();
  const { member } = useCustomerData();
  const supportedBrokers = brokers.filter((b) => SUPPORTED_BROKER_NAMES.includes(b.name));
  const [brokerId, setBrokerId] = useState(() => String(supportedBrokers.find((b) => b.name === "XM")?.id ?? supportedBrokers[0]?.id ?? ""));
  const [tradeId, setTradeId] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);

  function submit() {
    const id = tradeId.trim();
    if (!id) return;

    const broker = supportedBrokers.find((b) => b.id === Number(brokerId)) ?? supportedBrokers[0];
    const existing = tradeAccounts.find((a) => a.tradeId === id);

    if (existing) {
      setTradeId("");
      if (existing.memberId === member.id) {
        setResult({
          status: "pending",
          title: t("dash.addTrade.result.existingMineTitle"),
          detail: t("dash.addTrade.result.existingMineDetail", { tradeId: id }),
        });
      } else {
        setResult({
          status: "fail",
          title: t("dash.addTrade.result.existingOtherTitle"),
          detail: t("dash.addTrade.result.existingOtherDetail", { tradeId: id }),
        });
      }
      return;
    }

    const nextId = Math.max(0, ...tradeAccounts.map((a) => a.id)) + 1;
    const today = new Date().toISOString().slice(0, 10);
    setTradeAccounts((cur) => [
      ...cur,
      {
        id: nextId,
        memberId: member.id,
        brokerId: broker?.id ?? 0,
        tradeId: id,
        accountType: "Standard",
        partnerIb: broker?.code ?? "",
        verification: "pending" as const,
        createdDate: today,
        lastSync: today,
        status: "active" as const,
      },
    ]);
    setTradeId("");
    setResult({
      status: "pending",
      title: t("dash.addTrade.result.newTitle"),
      detail: t("dash.addTrade.result.newDetail", { tradeId: id, broker: broker?.name ?? "" }),
    });
  }

  return (
    <>
      <div className="trade-id-inline">
        <div className="trade-id-field">
          <select
            className="trade-id-broker"
            value={brokerId}
            onChange={(e) => setBrokerId(e.target.value)}
            aria-label={t("dash.addTrade.broker")}
          >
            {supportedBrokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input
            value={tradeId}
            onChange={(e) => setTradeId(e.target.value)}
            placeholder={t("dash.addTrade.tradeIdPlaceholder")}
            aria-label={t("dash.addTrade.tradeId")}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </div>
        <button className="btn btn-primary" onClick={submit}>
          <Icon name="add_circle" />
          {t("dash.addTrade.confirm")}
        </button>
      </div>
      <VerifyResultModal result={result} onClose={() => setResult(null)} />
    </>
  );
}
