"use client";

import { useState } from "react";
import { useCrm,
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
import { apiCall } from "../../lib/crmApi";

export default function MemberIndicatorAccessPanel({ member }: { member: Member }) {
  const { settings, toast, log, indicatorAccess, setIndicatorAccess, indicators, backendLive } = useCrm();
  const { t } = useLanguage();
  const [grantName, setGrantName] = useState("");

  const myAccess = memberIndicatorAccess(member.id, indicatorAccess);
  const grantable = indicators.filter((i) => i.status === "active" && !myAccess.some((a) => a.indicator === i.name && a.status !== "expired"));
  const effectiveGrantName = grantable.some((i) => i.name === grantName) ? grantName : grantable[0]?.name ?? "";

  function applyAccess(id: number, patch: Partial<IndicatorAccess>) {
    setIndicatorAccess((cur) => cur.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  async function patchAccess(access: IndicatorAccess, patch: Partial<IndicatorAccess>, action: string, description: string, toastKey: string) {
    if (!backendLive) {
      applyAccess(access.id, patch);
      log({ actor: "Alex Dean", memberId: member.id, memberName: member.name, action, description });
      toast(t(toastKey, { name: member.name }));
      return;
    }
    try {
      const payload = await apiCall<{ indicatorAccess: IndicatorAccess }>(`/api/crm/indicator-access/${access.id}/`, "PATCH", {
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.expiryDate ? { expiresAt: patch.expiryDate } : {}),
        ...(patch.status === "active" && patch.expiryDate ? { renewed: true } : {}),
      });
      applyAccess(access.id, payload.indicatorAccess);
      log({ actor: "Alex Dean", memberId: member.id, memberName: member.name, action, description });
      toast(t(toastKey, { name: member.name }));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to update indicator access");
    }
  }

  async function grantAccess() {
    if (!effectiveGrantName) return;
    const today = new Date().toISOString().slice(0, 10);
    const expiry = addMonths(today, settings.renewalPeriodMonths);
    if (!backendLive) {
      setIndicatorAccess((cur) => [
        { id: Math.max(0, ...cur.map((a) => a.id)) + 1, memberId: member.id, indicator: effectiveGrantName, status: "active", source: "Admin", startDate: today, expiryDate: expiry },
        ...cur,
      ]);
      log({ actor: "Alex Dean", memberId: member.id, memberName: member.name, action: "Indicator Granted", description: `${effectiveGrantName} granted by admin, expires ${expiry}.` });
      toast(t("ia.toast.granted", { name: member.name, indicator: effectiveGrantName }));
      return;
    }
    try {
      const indicator = indicators.find((i) => i.name === effectiveGrantName);
      const payload = await apiCall<{ indicatorAccess: IndicatorAccess }>("/api/crm/indicator-access/", "POST", {
        memberId: member.id,
        ...(indicator ? { indicatorId: indicator.id } : { indicatorName: effectiveGrantName }),
        status: "active",
        source: "Admin",
        startsAt: today,
        expiresAt: expiry,
      });
      // Server records the manual history row + activity log. The grant may
      // have renewed an expired row (same id) or created a new one.
      const fresh = payload.indicatorAccess;
      setIndicatorAccess((cur) => (cur.some((a) => a.id === fresh.id)
        ? cur.map((a) => (a.id === fresh.id ? fresh : a))
        : [fresh, ...cur]));
      toast(t("ia.toast.granted", { name: member.name, indicator: effectiveGrantName }));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to grant indicator access");
    }
  }

  function extendAccess(access: IndicatorAccess) {
    // Manual renewal runs server-side: extends from max(expiry, now) and
    // records a manual history row with the current cycle lots attached.
    if (!backendLive) {
      const oldExpiry = access.expiryDate;
      const newExpiry = addMonths(oldExpiry, settings.renewalPeriodMonths);
      applyAccess(access.id, { status: "active", expiryDate: newExpiry, lastRenewalDate: new Date().toISOString().slice(0, 10) });
      log({ actor: "Alex Dean", memberId: member.id, memberName: member.name, action: "Indicator Renewed", description: `${access.indicator}: manually extended ${settings.renewalPeriodMonths} month(s). Expiry changed ${oldExpiry} → ${newExpiry}.` });
      toast(t("ia.toast.extended", { name: member.name }));
      return;
    }
    apiCall<{ indicatorAccess: IndicatorAccess }>(`/api/crm/indicator-access/${access.id}/`, "PATCH", { extend: true })
      .then((payload) => {
        applyAccess(access.id, payload.indicatorAccess);
        toast(t("ia.toast.extended", { name: member.name }));
      })
      .catch((error) => {
        toast(error instanceof Error ? error.message : "Unable to extend indicator access");
      });
  }

  function suspendAccess(access: IndicatorAccess) {
    void patchAccess(
      access,
      { status: "suspended" },
      "Manual Admin Override",
      `${access.indicator}: access suspended by admin.`,
      "ia.toast.suspended",
    );
  }

  function revokeAccess(access: IndicatorAccess) {
    void patchAccess(
      access,
      { status: "expired" },
      "Indicator Expired",
      `${access.indicator}: access revoked by admin.`,
      "ia.toast.revoked",
    );
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
