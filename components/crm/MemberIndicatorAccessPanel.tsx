"use client";

import { useState } from "react";
import {
  useCrm,
  accessLabel,
  accessBadgeClass,
  accessLabelKey,
  memberIndicatorAccess,
  addMonths,
  fmtDate,
  type Member,
  type IndicatorAccess,
} from "./CrmContext";
import { useLanguage } from "./LanguageContext";

export default function MemberIndicatorAccessPanel({ member }: { member: Member }) {
  const { settings, toast, log, indicatorAccess, setIndicatorAccess, indicators } = useCrm();
  const { t } = useLanguage();
  const [grantName, setGrantName] = useState("");

  const myAccess = memberIndicatorAccess(member.id, indicatorAccess);
  const grantable = indicators.filter((i) => i.status === "active" && !myAccess.some((a) => a.indicator === i.name && a.status !== "expired"));
  const effectiveGrantName = grantable.some((i) => i.name === grantName) ? grantName : grantable[0]?.name ?? "";

  function grantAccess() {
    if (!effectiveGrantName) return;
    const today = new Date().toISOString().slice(0, 10);
    const expiry = addMonths(today, settings.renewalPeriodMonths);
    setIndicatorAccess((cur) => [
      { id: Math.max(0, ...cur.map((a) => a.id)) + 1, memberId: member.id, indicator: effectiveGrantName, status: "active", source: "Admin", startDate: today, expiryDate: expiry },
      ...cur,
    ]);
    log({ actor: "Alex Dean", memberId: member.id, memberName: member.name, action: "Indicator Granted", description: `${effectiveGrantName} granted by admin, expires ${expiry}.` });
    toast(t("ia.toast.granted", { name: member.name, indicator: effectiveGrantName }));
  }

  function extendAccess(access: IndicatorAccess) {
    const oldExpiry = access.expiryDate;
    const newExpiry = addMonths(oldExpiry, settings.renewalPeriodMonths);
    setIndicatorAccess((cur) => cur.map((a) => (a.id === access.id ? { ...a, status: "active", expiryDate: newExpiry, lastRenewalDate: new Date().toISOString().slice(0, 10) } : a)));
    log({ actor: "Alex Dean", memberId: member.id, memberName: member.name, action: "Indicator Renewed", description: `${access.indicator}: manually extended ${settings.renewalPeriodMonths} month(s). Expiry changed ${oldExpiry} → ${newExpiry}.` });
    toast(t("ia.toast.extended", { name: member.name }));
  }

  function suspendAccess(access: IndicatorAccess) {
    setIndicatorAccess((cur) => cur.map((a) => (a.id === access.id ? { ...a, status: "suspended" } : a)));
    log({ actor: "Alex Dean", memberId: member.id, memberName: member.name, action: "Manual Admin Override", description: `${access.indicator}: access suspended by admin.` });
    toast(t("ia.toast.suspended", { name: member.name }));
  }

  function revokeAccess(access: IndicatorAccess) {
    setIndicatorAccess((cur) => cur.map((a) => (a.id === access.id ? { ...a, status: "expired" } : a)));
    log({ actor: "Alex Dean", memberId: member.id, memberName: member.name, action: "Indicator Expired", description: `${access.indicator}: access revoked by admin.` });
    toast(t("ia.toast.revoked", { name: member.name }));
  }

  return (
    <div className="drawer-section" style={{ marginTop: 0 }}>
      <h4>
        {t("members.section.indicatorAccess")} ({myAccess.length})
      </h4>
      {myAccess.length ? (
        myAccess.map((a) => {
          const label = accessLabel(a, settings);
          return (
            <div key={a.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
              <div className="drawer-row" style={{ paddingTop: 0 }}>
                <span className="k">{a.indicator}</span>
                <span className="v">
                  <span className={`badge ${accessBadgeClass(label)}`}>{t(accessLabelKey(label))}</span>
                </span>
              </div>
              <div className="drawer-row" style={{ paddingBottom: 0 }}>
                <span className="k">{t("members.col.expiryDate")}</span>
                <span className="v">{fmtDate(a.expiryDate)}</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1, padding: "6px 10px" }} onClick={() => extendAccess(a)}>
                  {t("ia.extend")}
                </button>
                {a.status !== "suspended" && (
                  <button className="btn btn-ghost" style={{ flex: 1, padding: "6px 10px" }} onClick={() => suspendAccess(a)}>
                    {t("ia.suspend")}
                  </button>
                )}
                <button className="btn btn-danger" style={{ flex: 1, padding: "6px 10px" }} onClick={() => revokeAccess(a)}>
                  {t("ia.revokeNow")}
                </button>
              </div>
            </div>
          );
        })
      ) : (
        <div style={{ fontSize: 13, color: "var(--text-sub)", marginBottom: 12 }}>{t("members.noIndicatorAccess")}</div>
      )}
      {grantable.length > 0 && (
        <div style={{ display: "flex", gap: 8 }}>
          <select className="input" style={{ flex: 1 }} value={effectiveGrantName} onChange={(e) => setGrantName(e.target.value)}>
            {grantable.map((i) => (
              <option key={i.id} value={i.name}>
                {i.name}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={grantAccess}>
            {t("ia.grantAccess")}
          </button>
        </div>
      )}
    </div>
  );
}
