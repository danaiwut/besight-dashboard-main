"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useCrm, ACCOUNT_TYPES, memberLotRange, currentMonthRange, type TradeAccount, type VerificationStatus } from "./CrmContext";
import { useLanguage } from "./LanguageContext";
import { apiCall } from "../../lib/crmApi";
import Icon from "../Icon";
import MemberCombobox from "./MemberCombobox";
import TradeAccountHistoryPanel from "./TradeAccountHistoryPanel";

export type TradeAccountFormHandle = { save: () => void };

const TradeAccountForm = forwardRef<TradeAccountFormHandle, { account: TradeAccount | null; defaultMemberId?: number; onDone: () => void }>(
  function TradeAccountForm({ account, defaultMemberId, onDone }, ref) {
    const { setTradeAccounts, members, brokers, toast, log, backendLive } = useCrm();
    const { t } = useLanguage();
    const isNew = !account;
    const [memberId, setMemberId] = useState(account?.memberId ?? defaultMemberId ?? 0);
    const [brokerId, setBrokerId] = useState(account?.brokerId ?? brokers[0]?.id ?? 0);
    const [tradeId, setTradeId] = useState(account?.tradeId ?? "");
    const [verification, setVerification] = useState<VerificationStatus>(account?.verification ?? "pending");
    const [status, setStatus] = useState<TradeAccount["status"]>(account?.status ?? "active");
    const [checkResult, setCheckResult] = useState<VerificationStatus | null>(null);
    const [checkMessage, setCheckMessage] = useState("");
    const [checking, setChecking] = useState(false);
    const [accountType, setAccountType] = useState(account?.accountType ?? "Standard");

    /* Real verification: asks the lot-check webhook whether this Trade ID has
       traded in the last 12 months. Preview only — the outcome is saved when
       the admin saves the account. */
    async function checkTradeId() {
      const id = tradeId.trim();
      if (!id) return;
      setChecking(true);
      setCheckMessage("");
      try {
        const payload = await apiCall<{ verification: VerificationStatus; message: string }>(
          "/api/crm/trade-accounts/verify/",
          "POST",
          { tradeId: id },
        );
        setCheckResult(payload.verification);
        setVerification(payload.verification);
        setCheckMessage(payload.message);
      } catch (error) {
        setCheckResult(null);
        setCheckMessage(error instanceof Error ? error.message : "Unable to verify Trade ID");
      } finally {
        setChecking(false);
      }
    }

    useImperativeHandle(ref, () => ({
      save() {
        void saveAsync();
      },
    }));

    async function saveAsync() {
      const trimmedId = tradeId.trim();
      if (!trimmedId) {
        toast(t("ta.toast.tradeIdRequired"));
        return;
      }
      if (!backendLive) {
        saveLocal(trimmedId);
        onDone();
        return;
      }
      try {
        const member = members.find((m) => m.id === memberId);
        const broker = brokers.find((b) => b.id === brokerId);
        const data = {
          memberId,
          brokerId,
          tradeId: trimmedId,
          accountType,
          partnerIb: broker?.code ?? "",
          verification,
          status,
        };
        if (isNew) {
          const payload = await apiCall<{ tradeAccount: TradeAccount }>("/api/crm/trade-accounts/", "POST", data);
          setTradeAccounts((cur) => [payload.tradeAccount, ...cur]);
          log({
            memberId: memberId || undefined,
            memberName: member?.name,
            action: "Trade ID Added",
            description: member
              ? `Trade ID ${trimmedId} at ${broker?.name ?? "broker"} added for ${member.name}.`
              : `Trade ID ${trimmedId} at ${broker?.name ?? "broker"} added — not yet linked to a member.`,
          });
          toast(t("ta.toast.added"));
        } else {
          const payload = await apiCall<{ tradeAccount: TradeAccount }>(`/api/crm/trade-accounts/${account!.id}/`, "PUT", data);
          setTradeAccounts((cur) => cur.map((a) => (a.id === account!.id ? payload.tradeAccount : a)));
          if (account!.verification !== verification && verification === "verified") {
            log({ memberId, memberName: member?.name, action: "Trade ID Verified", description: `Trade ID ${trimmedId} at ${broker?.name ?? "broker"} marked verified.` });
          }
          toast(t("ta.toast.updated"));
        }
        onDone();
      } catch (error) {
        toast(error instanceof Error ? error.message : "Unable to save trade account");
      }
    }

    /* Demo mode (no backend): the original local-only flow, unchanged. */
    function saveLocal(trimmedId: string) {
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
            log({ memberId, memberName: member?.name, action: "Trade ID Verified", description: `Trade ID ${trimmedId} at ${broker?.name ?? "broker"} marked verified.` });
          }
          toast(t("ta.toast.updated"));
        }
    }

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
              onChange={(e) => { setTradeId(e.target.value); setCheckResult(null); setCheckMessage(""); }}
              placeholder="e.g. 390894526"
            />
            <button type="button" className="br-check" aria-label={t("ta.form.checkTradeId")} onClick={() => void checkTradeId()} disabled={checking}>
              <Icon name={checking ? "progress_activity" : "search"} />
            </button>
          </div>
          {(checkResult || checkMessage) && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              {checkResult && (
                <Icon
                  name={checkResult === "verified" ? "check_circle" : "schedule"}
                  style={{ color: checkResult === "verified" ? "var(--green)" : "var(--amber)", fontSize: 16 }}
                />
              )}
              <span className={`badge ${checkResult === "verified" ? "active" : checkResult ? "pending" : "expired"}`}>
                {checkMessage || (checkResult === "verified" ? t("ta.form.checkPassed") : t("ta.form.checkFailed"))}
              </span>
            </div>
          )}
        </div>
        <div className="field">
          <label>{t("ta.form.accountType")}</label>
          <select className="input" value={accountType} onChange={(e) => setAccountType(e.target.value)}>
            {ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
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
        {!isNew && (() => {
          const owner = members.find((m) => m.id === account!.memberId);
          return <TradeAccountHistoryPanel accountId={account!.id} tradeId={account!.tradeId} range={owner ? memberLotRange(owner) : currentMonthRange()} />;
        })()}
      </>
    );
  }
);

export default TradeAccountForm;
