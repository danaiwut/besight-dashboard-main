"use client";

import { useState } from "react";
import { useCrm, type TradeAccount } from "../crm/CrmContext";
import { useLanguage } from "../crm/LanguageContext";
import { apiCall, ApiError } from "../../lib/crmApi";
import VerifyResultModal, { type VerifyResult } from "../crm/VerifyResultModal";
import Icon from "../Icon";

/** Inline "type it and go" Trade ID entry on the dashboard home. The member
 *  enters their own account — nothing is pre-provisioned — and it is saved to
 *  the database via /api/me/trade-accounts (auto-verified against the lot
 *  webhook, rejected if the ID already belongs to someone else). */
const SUPPORTED_BROKER_NAMES = ["XM", "Exness"];

export default function TradeIdInline() {
  const { t } = useLanguage();
  const { brokers, setTradeAccounts, identity, toast } = useCrm();
  const supportedBrokers = brokers.filter((b) => SUPPORTED_BROKER_NAMES.includes(b.name));
  const [brokerId, setBrokerId] = useState(() => String(supportedBrokers.find((b) => b.name === "XM")?.id ?? supportedBrokers[0]?.id ?? ""));
  const [tradeId, setTradeId] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const id = tradeId.trim();
    if (!id) {
      toast(t("dash.addTrade.tradeIdRequired"));
      return;
    }
    if (!identity) {
      toast(t("dash.identity.required"));
      return;
    }
    setBusy(true);
    try {
      const payload = await apiCall<{ tradeAccount: TradeAccount; alreadyLinked?: boolean; verificationMessage?: string }>(
        "/api/me/trade-accounts/",
        "POST",
        { tradeId: id, brokerId: Number(brokerId) || undefined, ...identity },
      );
      setTradeAccounts((cur) => (cur.some((a) => a.id === payload.tradeAccount.id) ? cur : [payload.tradeAccount, ...cur]));
      setTradeId("");

      if (payload.alreadyLinked) {
        setResult({
          status: "pending",
          title: t("dash.addTrade.result.existingMineTitle"),
          detail: t("dash.addTrade.result.existingMineDetail", { tradeId: id }),
        });
      } else {
        const verified = payload.tradeAccount.verification === "verified";
        const brokerName = supportedBrokers.find((b) => b.id === Number(brokerId))?.name ?? "";
        setResult({
          status: verified ? "pass" : "pending",
          title: t("dash.addTrade.result.newTitle"),
          detail: payload.verificationMessage || t("dash.addTrade.result.newDetail", { tradeId: id, broker: brokerName }),
        });
      }
      toast(t("dash.addTrade.toast.added", { tradeId: id }));
    } catch (error) {
      const taken = error instanceof ApiError && error.code === "trade_id_taken";
      setResult({
        status: "fail",
        title: taken ? t("dash.addTrade.result.existingOtherTitle") : t("dash.addTrade.result.failTitle"),
        detail: taken
          ? t("dash.addTrade.result.existingOtherDetail", { tradeId: id })
          : error instanceof Error ? error.message : "",
      });
    } finally {
      setBusy(false);
    }
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
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </div>
        <button className="btn btn-primary" onClick={() => void submit()} disabled={busy || !identity} title={identity ? undefined : t("dash.identity.required")}>
          <Icon name="add_circle" />
          {t("dash.addTrade.confirm")}
        </button>
      </div>
      <VerifyResultModal result={result} onClose={() => setResult(null)} />
    </>
  );
}
