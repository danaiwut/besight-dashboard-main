"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import {
  useCrm,
  PLAN_LABELS,
  simulateTradeIdVerification,
  simulateAccountType,
  verificationLabelKey,
  ACQUISITION_CHANNELS,
  ACQUISITION_CHANNEL_LABELS,
  type Member,
  type Plan,
  type TradeAccount,
  type VerificationStatus,
  type AcquisitionChannel,
  type CustomerStage,
} from "./CrmContext";
import { useLanguage } from "./LanguageContext";
import Icon from "../Icon";

type Row = {
  key: string;
  brokerId: number;
  tradeId: string;
  existingVerification?: VerificationStatus;
  checkResult?: VerificationStatus;
  checkAccountType?: string;
};

function makeRow(brokerId: number, tradeId = "", existingVerification?: VerificationStatus): Row {
  return { key: Math.random().toString(36).slice(2), brokerId, tradeId, existingVerification };
}

type RowBadge = { icon: string; color: string; badgeClass: string; label: string; accountType?: string };

/** A fresh Check always wins (icon/color/wording specific to a pass/fail
 *  check result, plus the account type a pass "returns"); otherwise an
 *  existing account shows whatever verification status it already has (an
 *  admin may have manually corrected it) — a new, unchecked row shows
 *  nothing, no live-typing guesswork. */
function rowBadge(r: Row, t: (key: string) => string): RowBadge | null {
  if (r.checkResult) {
    return r.checkResult === "verified"
      ? { icon: "check_circle", color: "var(--green)", badgeClass: "active", label: t("members.form.checkPassed"), accountType: r.checkAccountType }
      : { icon: "cancel", color: "var(--red)", badgeClass: "expired", label: t("members.form.checkFailed") };
  }
  const v = r.existingVerification;
  if (!v) return null;
  if (v === "verified") return { icon: "check_circle", color: "var(--green)", badgeClass: "active", label: t(verificationLabelKey(v)) };
  if (v === "pending") return { icon: "schedule", color: "var(--cyan)", badgeClass: "pending", label: t("members.form.pendingRecheck") };
  return { icon: "cancel", color: "var(--red)", badgeClass: "expired", label: t(verificationLabelKey(v)) };
}

/** Reuses whatever the Check button already found for this row; if the admin
 *  never clicked Check, resolves the same way on save so a row that would
 *  pass isn't left with a blank account type just because it wasn't checked. */
function resolveNewAccountFields(r: Row) {
  const trimmedId = r.tradeId.trim();
  const verification = simulateTradeIdVerification(trimmedId);
  const accountType = r.checkAccountType ?? (verification === "verified" ? simulateAccountType(trimmedId) : "");
  return { trimmedId, verification, accountType };
}

export type MemberFormHandle = { save: () => void };

const MemberForm = forwardRef<MemberFormHandle, { member: Member | null; onDone: () => void }>(
  function MemberForm({ member, onDone }, ref) {
    const { members, setMembers, setTradeAccounts, brokers, tradeAccounts, toast, log, syncPlanAccess } = useCrm();
    const { t } = useLanguage();
    const isNew = !member;
    const [name, setName] = useState(member?.name ?? "");
    const [email, setEmail] = useState(member?.email ?? "");
    const [phone, setPhone] = useState(member?.phone ?? "");
    const [country, setCountry] = useState(member?.country ?? "");
    const [tv, setTv] = useState(member?.tv ?? "");
    const [telegramUsername, setTelegramUsername] = useState(member?.telegramUsername ?? "");
    const [channels, setChannels] = useState<AcquisitionChannel[]>(member?.channels ?? []);
    const [plan, setPlan] = useState<Plan>(member?.plan ?? "free");
    const [stageOverride, setStageOverride] = useState<"auto" | CustomerStage>(member?.customerStageOverride ?? "auto");
    const [rows, setRows] = useState<Row[]>(() => {
      if (member) {
        const existing = tradeAccounts.filter((a) => a.memberId === member.id);
        if (existing.length) return existing.map((a) => makeRow(a.brokerId, a.tradeId, a.verification));
      }
      return [makeRow(brokers[0]?.id ?? 0)];
    });

    function toggleChannel(c: AcquisitionChannel) {
      setChannels((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
    }
    function updateRow(key: string, patch: Partial<Row>) {
      setRows((cur) =>
        cur.map((r) =>
          r.key === key
            ? { ...r, ...patch, ...(patch.tradeId !== undefined ? { checkResult: undefined, checkAccountType: undefined } : {}) }
            : r
        )
      );
    }
    function checkTradeId(key: string) {
      setRows((cur) =>
        cur.map((r) => {
          if (r.key !== key || !r.tradeId.trim()) return r;
          const id = r.tradeId.trim();
          const result = simulateTradeIdVerification(id);
          return { ...r, checkResult: result, checkAccountType: result === "verified" ? simulateAccountType(id) : undefined };
        })
      );
    }
    function removeRow(key: string) {
      if (rows.length <= 1) {
        toast(t("members.toast.keepOneAccount"));
        return;
      }
      setRows((cur) => cur.filter((r) => r.key !== key));
    }
    function addRow() {
      setRows((cur) => [...cur, makeRow(brokers[0]?.id ?? 0)]);
    }

    useImperativeHandle(ref, () => ({
      save() {
        const trimmedName = name.trim();
        const trimmedEmail = email.trim();
        if (!trimmedName || !trimmedEmail) {
          toast(t("members.toast.nameEmailRequired"));
          return;
        }
        const today = new Date().toISOString().slice(0, 10);
        const data = {
          name: trimmedName,
          email: trimmedEmail,
          phone: phone.trim(),
          country: country.trim() || undefined,
          tv: tv.trim() || "—",
          telegramUsername: telegramUsername.trim() || undefined,
          channels: channels.length ? channels : undefined,
          plan,
          customerStageOverride: stageOverride === "auto" ? undefined : stageOverride,
        };

        if (isNew) {
          const id = Math.max(0, ...members.map((m) => m.id)) + 1;
          const code = `BS-${String(id).padStart(4, "0")}`;
          setMembers((cur) => {
            const newAccounts: TradeAccount[] = rows
              .filter((r) => r.tradeId.trim())
              .map((r, i) => {
                const { trimmedId, verification, accountType } = resolveNewAccountFields(r);
                return {
                  id: Math.max(0, ...tradeAccounts.map((a) => a.id)) + i + 1,
                  memberId: id,
                  brokerId: r.brokerId,
                  tradeId: trimmedId,
                  accountType,
                  partnerIb: brokers.find((b) => b.id === r.brokerId)?.code ?? "",
                  verification,
                  createdDate: today,
                  lastSync: today,
                  status: "active" as const,
                };
              });
            setTradeAccounts((accts) => [...accts, ...newAccounts]);
            log({ actor: "Alex Dean", memberId: id, memberName: trimmedName, action: "Member Added", description: `${trimmedName} added with ${newAccounts.length} trade account(s).` });
            return [{ id, code, joinedDate: today, createdDate: today, ...data }, ...cur];
          });
          const granted = syncPlanAccess(id, plan, trimmedName);
          toast(granted ? t("members.toast.addedWithPlan", { plan: PLAN_LABELS[plan], n: granted }) : t("members.toast.added"));
        } else {
          const planChanged = member!.plan !== plan;
          setMembers((cur) => cur.map((m) => (m.id === member!.id ? { ...m, ...data } : m)));
          const granted = planChanged ? syncPlanAccess(member!.id, plan, trimmedName) : 0;
          setTradeAccounts((accts) => {
            const others = accts.filter((a) => a.memberId !== member!.id);
            const mine = accts.filter((a) => a.memberId === member!.id);
            const updated = rows
              .filter((r) => r.tradeId.trim())
              .map((r, i) => {
                const existing = mine[i];
                if (existing) return { ...existing, brokerId: r.brokerId, tradeId: r.tradeId.trim() };
                const { trimmedId, verification, accountType } = resolveNewAccountFields(r);
                return {
                  id: Math.max(0, ...accts.map((a) => a.id)) + i + 1,
                  memberId: member!.id,
                  brokerId: r.brokerId,
                  tradeId: trimmedId,
                  accountType,
                  partnerIb: brokers.find((b) => b.id === r.brokerId)?.code ?? "",
                  verification,
                  createdDate: today,
                  lastSync: today,
                  status: "active" as const,
                };
              });
            return [...others, ...updated];
          });
          toast(granted ? t("members.toast.updatedWithPlan", { plan: PLAN_LABELS[plan], n: granted }) : t("members.toast.updated"));
        }
        onDone();
      },
    }));

    return (
      <>
        <div className="field">
          <label>{t("members.form.fullName")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jane Doe" />
        </div>
        <div className="field">
          <label>{t("members.form.email")}</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" />
        </div>
        <div className="field">
          <label>{t("members.form.phone")}</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+66 81 234 5671" />
        </div>
        <div className="field">
          <label>{t("members.form.country")}</label>
          <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Thailand" />
        </div>
        <div className="field">
          <label>{t("members.form.tvUsername")}</label>
          <input className="input" value={tv} onChange={(e) => setTv(e.target.value)} placeholder="username" />
        </div>
        <div className="field">
          <label>{t("members.form.telegramUsername")}</label>
          <input className="input" value={telegramUsername} onChange={(e) => setTelegramUsername(e.target.value)} placeholder="username" />
        </div>
        <div className="field">
          <label>
            {t("members.form.channels")} <span style={{ color: "var(--text-sub)" }}>{t("members.form.channelsHint")}</span>
          </label>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {ACQUISITION_CHANNELS.map((c) => (
              <label key={c} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={channels.includes(c)}
                  onChange={() => toggleChannel(c)}
                  style={{ width: 16, height: 16, accentColor: "var(--blue)" }}
                />
                {ACQUISITION_CHANNEL_LABELS[c]}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label>
            {t("members.form.plan")} <span style={{ color: "var(--text-sub)" }}>{t("members.form.planHint")}</span>
          </label>
          <select className="input" value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>
            <option value="free">{PLAN_LABELS.free}</option>
            <option value="ib_partner">{PLAN_LABELS.ib_partner}</option>
          </select>
        </div>
        <div className="field">
          <label>
            {t("members.form.stage")} <span style={{ color: "var(--text-sub)" }}>{t("members.form.stageHint")}</span>
          </label>
          <select className="input" value={stageOverride} onChange={(e) => setStageOverride(e.target.value as "auto" | CustomerStage)}>
            <option value="auto">{t("members.form.stageAuto")}</option>
            <option value="new">{t("members.stage.new")}</option>
            <option value="existing">{t("members.stage.existing")}</option>
          </select>
        </div>
        <div className="field">
          <label>
            {t("members.form.tradeAccounts")} <span style={{ color: "var(--text-sub)" }}>{t("members.form.addOneOrMore")}</span>
          </label>
          <div>
            {rows.map((r) => {
              const badge = rowBadge(r, t);
              return (
                <div className="broker-row" key={r.key}>
                  <div className="br-top">
                    <select className="input br-broker" aria-label="Broker" value={r.brokerId} onChange={(e) => updateRow(r.key, { brokerId: Number(e.target.value) })}>
                      {brokers.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="br-del" aria-label={t("members.form.removeTradeAccount")} onClick={() => removeRow(r.key)}>
                      <Icon name="close" />
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="input br-acct"
                      style={{ flex: 1, minWidth: 0 }}
                      placeholder={t("members.form.tradeIdPlaceholder")}
                      value={r.tradeId}
                      onChange={(e) => updateRow(r.key, { tradeId: e.target.value })}
                    />
                    <button type="button" className="br-check" aria-label={t("members.form.checkTradeId")} onClick={() => checkTradeId(r.key)}>
                      <Icon name="search" />
                    </button>
                  </div>
                  {badge && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                      <Icon name={badge.icon} style={{ color: badge.color, fontSize: 16 }} />
                      <span className={`badge ${badge.badgeClass}`}>{badge.label}</span>
                      {badge.accountType && <span style={{ fontSize: 12.5, color: "var(--text-sub)" }}>{badge.accountType}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" className="btn btn-ghost" style={{ width: "100%", marginTop: 2 }} onClick={addRow}>
            <Icon name="add" />
            {t("members.form.addTradeAccount")}
          </button>
        </div>
      </>
    );
  }
);

export default MemberForm;
