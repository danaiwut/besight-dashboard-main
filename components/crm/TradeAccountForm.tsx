"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useCrm, simulateTradeIdVerification, simulateAccountType, type TradeAccount, type VerificationStatus } from "./CrmContext";
import { useLanguage } from "./LanguageContext";
import Icon from "../Icon";
import MemberCombobox from "./MemberCombobox";
import TradeAccountHistoryPanel from "./TradeAccountHistoryPanel";

export type TradeAccountFormHandle = { save: () => void };

const TradeAccountForm = forwardRef<TradeAccountFormHandle, { account: TradeAccount | null; defaultMemberId?: number; onDone: () => void }>(
  function TradeAccountForm({ account, defaultMemberId, onDone }, ref) {
    const { setTradeAccounts, members, brokers, toast, log } = useCrm();
    const { t } = useLanguage();
    const isNew = !account;
    const [memberId, setMemberId] = useState(account?.memberId ?? defaultMemberId ?? 0);
    const [brokerId, setBrokerId] = useState(account?.brokerId ?? brokers[0]?.id ?? 0);
    const [tradeId, setTradeId] = useState(account?.tradeId ?? "");
    const [verification, setVerification] = useState<VerificationStatus>(account?.verification ?? "pending");
    const [status, setStatus] = useState<TradeAccount["status"]>(account?.status ?? "active");
    const [checkResult, setCheckResult] = useState<VerificationStatus | null>(null);
    const [accountType, setAccountType] = useState(account?.accountType ?? "");

    function checkTradeId() {
      const id = tradeId.trim();
      if (!id) return;
      const result = simulateTradeIdVerification(id);
      setCheckResult(result);
      setVerification(result);
      setAccountType(result === "verified" ? simulateAccountType(id) : "");
    }

    useImperativeHandle(ref, () => ({
      save() {
        const trimmedId = tradeId.trim();
        if (!trimmedId) {
          toast(t("ta.toast.tradeIdRequired"));
          return;
        }
        const member = members.find((m) => m.id === memberId);
        const broker = brokers.find((b) => b.id === brokerId);
        const today = new Date().toISOString().slice(0, 10);
        const data = { memberId, brokerId, tradeId: trimmedId, accountType, partnerIb: broker?.code ?? "", verification, status };

        if (isNew) {
          setTradeAccounts((cur) => [
            { id: Math.max(0, ...cur.map((a) => a.id)) + 1, createdDate: today, lastSync: today, ...data },
            ...cur,
          ]);
          log({
            actor: "Alex Dean",
            memberId: memberId || undefined,
            memberName: member?.name,
            action: "Trade ID Added",
            description: member
              ? `Trade ID ${trimmedId} at ${broker?.name ?? "broker"} added for ${member.name}.`
              : `Trade ID ${trimmedId} at ${broker?.name ?? "broker"} added — not yet linked to a member.`,
          });
          toast(t("ta.toast.added"));
        } else {
          setTradeAccounts((cur) => cur.map((a) => (a.id === account!.id ? { ...a, ...data } : a)));
          if (account!.verification !== verification && verification === "verified") {
            log({ actor: "Alex Dean", memberId, memberName: member?.name, action: "Trade ID Verified", description: `Trade ID ${trimmedId} at ${broker?.name ?? "broker"} marked verified.` });
          }
          toast(t("ta.toast.updated"));
        }
        onDone();
      },
    }));

    return (
      <>
        <div className="field">
          <label>{t("ta.form.member")}</label>
          <MemberCombobox members={members} value={memberId} onChange={setMemberId} ariaLabel={t("ta.form.member")} noneLabel={t("ta.noneNotSignedUp")} />
        </div>
        <div className="field">
          <label>{t("ta.form.broker")}</label>
          <select className="input" value={brokerId} onChange={(e) => setBrokerId(Number(e.target.value))}>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t("ta.form.tradeId")}</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              style={{ flex: 1, minWidth: 0 }}
              value={tradeId}
              onChange={(e) => { setTradeId(e.target.value); setCheckResult(null); setAccountType(""); }}
              placeholder="e.g. 390894526"
            />
            <button type="button" className="br-check" aria-label={t("ta.form.checkTradeId")} onClick={checkTradeId}>
              <Icon name="search" />
            </button>
          </div>
          {checkResult && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              <Icon
                name={checkResult === "verified" ? "check_circle" : "cancel"}
                style={{ color: checkResult === "verified" ? "var(--green)" : "var(--red)", fontSize: 16 }}
              />
              <span className={`badge ${checkResult === "verified" ? "active" : "expired"}`}>
                {checkResult === "verified" ? t("ta.form.checkPassed") : t("ta.form.checkFailed")}
              </span>
              {checkResult === "verified" && accountType && <span style={{ fontSize: 12.5, color: "var(--text-sub)" }}>{accountType}</span>}
            </div>
          )}
        </div>
        <div className="field">
          <label>{t("ta.form.verificationStatus")}</label>
          <select className="input" value={verification} onChange={(e) => setVerification(e.target.value as VerificationStatus)}>
            <option value="verified">{t("common.verified")}</option>
            <option value="pending">{t("common.pending")}</option>
            <option value="not_found">{t("common.notFound")}</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: isNew ? 0 : 20 }}>
          <label>{t("ta.form.status")}</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as TradeAccount["status"])}>
            <option value="active">{t("common.active")}</option>
            <option value="inactive">{t("common.inactive")}</option>
          </select>
        </div>
        {!isNew && <TradeAccountHistoryPanel accountId={account!.id} />}
      </>
    );
  }
);

export default TradeAccountForm;
