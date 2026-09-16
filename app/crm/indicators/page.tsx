"use client";

import { useEffect, useRef, useState } from "react";
import { useCrm, PLAN_LABELS, type Indicator, type LotCalculationMode, type Plan } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { apiCall } from "../../../lib/crmApi";
import { IndicatorsSkeleton } from "../../../components/crm/Skeletons";
import Icon from "../../../components/Icon";
import Drawer from "../../../components/crm/Drawer";
import IndicatorForm, { type IndicatorFormHandle } from "../../../components/crm/IndicatorForm";

function IndicatorsCard() {
  const { indicators, setIndicators, indicatorAccess, toast, backendLive } = useCrm();
  const { t } = useLanguage();
  const [drawerOpen, setDrawerOpen] = useState<{ indicator: Indicator | null } | null>(null);
  const formRef = useRef<IndicatorFormHandle>(null);

  async function remove(ind: Indicator) {
    const inUse = indicatorAccess.some((a) => a.indicator === ind.name);
    if (inUse) {
      toast(t("set.toast.indicatorInUse", { name: ind.name }));
      return;
    }
    if (!backendLive) {
      setIndicators((cur) => cur.filter((i) => i.id !== ind.id));
      toast(t("set.toast.indicatorRemoved", { name: ind.name }));
      return;
    }
    try {
      await apiCall(`/api/crm/indicators/${ind.id}/`, "DELETE");
      setIndicators((cur) => cur.filter((i) => i.id !== ind.id));
      toast(t("set.toast.indicatorRemoved", { name: ind.name }));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to delete indicator");
    }
  }

  return (
    <div className="card" style={{ padding: 22, marginBottom: 22 }}>
      <div className="settings-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h3>{t("set.indicators")}</h3>
          <div className="desc" style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 2 }}>
            {t("set.indicatorsDesc")}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setDrawerOpen({ indicator: null })}>
          <Icon name="add" />
          {t("set.addIndicator")}
        </button>
      </div>
      {indicators.map((ind) => {
        const memberCount = new Set(indicatorAccess.filter((a) => a.indicator === ind.name).map((a) => a.memberId)).size;
        return (
          <div className="set-row" key={ind.id}>
            <div>
              <div className="t">
                {ind.name} {ind.pubId && <span className="mono" style={{ fontSize: 12, color: "var(--text-sub)", fontWeight: 400 }}>· {ind.pubId}</span>}
              </div>
              <div className="d">
                {t("set.membersWithAccess", { n: memberCount })} · <span className={`status-pill ${ind.status === "active" ? "published" : "draft"}`}>{ind.status === "active" ? t("common.active") : t("common.inactive")}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="kebab" aria-label={`Edit ${ind.name}`} onClick={() => setDrawerOpen({ indicator: ind })}>
                <Icon name="edit" />
              </button>
              <button className="kebab" aria-label={`Remove ${ind.name}`} onClick={() => remove(ind)}>
                <Icon name="delete" />
              </button>
            </div>
          </div>
        );
      })}

      <Drawer
        open={!!drawerOpen}
        title={drawerOpen?.indicator ? t("set.editIndicator") : t("set.addIndicatorTitle")}
        onClose={() => setDrawerOpen(null)}
        body={drawerOpen ? <IndicatorForm ref={formRef} indicator={drawerOpen.indicator} onDone={() => setDrawerOpen(null)} /> : null}
        foot={
          drawerOpen && (
            <>
              <button className="btn btn-ghost" onClick={() => setDrawerOpen(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={() => formRef.current?.save()}>
                {drawerOpen.indicator ? t("common.saveChanges") : t("set.addIndicator")}
              </button>
            </>
          )
        }
      />
    </div>
  );
}

function PlansCard() {
  const { members, indicators, settings, setSettings, syncPlanAccess, toast, backendLive } = useCrm();
  const { t } = useLanguage();
  const [draft, setDraft] = useState(settings.planEntitlements);

  // The provider hydrates real entitlements after mount — adopt them until
  // the admin starts editing (tracked by comparing against the last synced).
  const [synced, setSynced] = useState(settings.planEntitlements);
  useEffect(() => {
    if (JSON.stringify(draft) === JSON.stringify(synced)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(settings.planEntitlements);
      setSynced(settings.planEntitlements);
    }
  }, [settings.planEntitlements, draft, synced]);

  function toggle(plan: Plan, indicatorId: number) {
    setDraft((cur) => {
      const has = cur[plan].includes(indicatorId);
      return { ...cur, [plan]: has ? cur[plan].filter((id) => id !== indicatorId) : [...cur[plan], indicatorId] };
    });
  }

  async function save() {
    if (!backendLive) {
      setSettings((cur) => ({ ...cur, planEntitlements: draft }));
      setSynced(draft);
      toast(t("set.toast.plansSaved"));
      return;
    }
    try {
      const payload = await apiCall<{ planEntitlements: Record<Plan, number[]> }>("/api/crm/settings/plan-entitlements/", "PUT", draft);
      setSettings((cur) => ({ ...cur, planEntitlements: payload.planEntitlements }));
      setSynced(payload.planEntitlements);
      toast(t("set.toast.plansSaved"));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to save plans");
    }
  }

  async function syncAll() {
    let total = 0;
    for (const m of members) total += await syncPlanAccess(m.id, m.plan, m.name);
    toast(total ? t("set.toast.syncedSome", { n: total }) : t("set.toast.syncedNone"));
  }

  return (
    <div className="card" style={{ padding: 22, marginBottom: 22 }}>
      <div className="settings-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h3>{t("set.plans")}</h3>
          <div className="desc" style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 2 }}>
            {t("set.plansDesc")}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={syncAll}>
          {t("set.syncAllToPlan")}
        </button>
      </div>
      <div className="table-wrap" style={{ marginTop: 6 }}>
        <table className="data" style={{ minWidth: 420 }}>
          <thead>
            <tr>
              <th>{t("set.indicators")}</th>
              <th>{PLAN_LABELS.free}</th>
              <th>{PLAN_LABELS.ib_partner}</th>
            </tr>
          </thead>
          <tbody>
            {indicators.map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td>
                  <input type="checkbox" style={{ width: 16, height: 16, accentColor: "var(--blue)" }} checked={draft.free.includes(i.id)} onChange={() => toggle("free", i.id)} />
                </td>
                <td>
                  <input type="checkbox" style={{ width: 16, height: 16, accentColor: "var(--blue)" }} checked={draft.ib_partner.includes(i.id)} onChange={() => toggle("ib_partner", i.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn btn-primary" onClick={save}>
          {t("set.savePlans")}
        </button>
      </div>
    </div>
  );
}

function IndicatorSettingsCard() {
  const { settings, setSettings, toast, backendLive } = useCrm();
  const { t } = useLanguage();
  const [requiredLots, setRequiredLots] = useState(settings.requiredLots);
  const [renewalPeriodMonths, setRenewalPeriodMonths] = useState(settings.renewalPeriodMonths);
  const [expiringSoonDays, setExpiringSoonDays] = useState(settings.expiringSoonDays);
  const [autoRenewalEnabled, setAutoRenewalEnabled] = useState(settings.autoRenewalEnabled);
  const [lotCalculationMode, setLotCalculationMode] = useState<LotCalculationMode>(settings.lotCalculationMode);
  const [saving, setSaving] = useState(false);

  // Automation + general settings hydrate from the backend after mount (the
  // provider owns the fetch now) — adopt them into the draft form.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRequiredLots(settings.requiredLots);
    setRenewalPeriodMonths(settings.renewalPeriodMonths);
    setAutoRenewalEnabled(settings.autoRenewalEnabled);
    setLotCalculationMode(settings.lotCalculationMode);
  }, [settings.requiredLots, settings.renewalPeriodMonths, settings.autoRenewalEnabled, settings.lotCalculationMode]);

  async function save() {
    setSaving(true);
    try {
      if (!backendLive) {
        setSettings((current) => ({ ...current, requiredLots, renewalPeriodMonths, expiringSoonDays, autoRenewalEnabled, lotCalculationMode }));
        toast(t("set.toast.indicatorSaved"));
        return;
      }
      const response = await fetch("/api/crm/settings/indicator-automation/", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requiredLots, renewalMonths: renewalPeriodMonths, enabled: autoRenewalEnabled }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Unable to save Indicator settings");
      setSettings((current) => ({ ...current, requiredLots, renewalPeriodMonths, expiringSoonDays, autoRenewalEnabled, lotCalculationMode }));
      toast(t("set.toast.indicatorSaved"));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to save Indicator settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ padding: 22, marginBottom: 22 }}>
      <div className="settings-head">
        <h3>{t("set.indicatorSettings")}</h3>
        <div className="desc" style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 2 }}>
          {t("set.indicatorSettingsDesc")}
        </div>
      </div>
      <div className="form-grid2">
        <div className="field">
          <label>{t("set.requiredLots")}</label>
          <input className="input" type="number" step={0.1} min={0} value={requiredLots} onChange={(e) => setRequiredLots(Math.max(0, parseFloat(e.target.value) || 0))} />
        </div>
        <div className="field">
          <label>{t("set.renewalPeriod")}</label>
          <input className="input" type="number" min={1} value={renewalPeriodMonths} onChange={(e) => setRenewalPeriodMonths(Math.max(1, parseInt(e.target.value) || 1))} />
        </div>
        <div className="field">
          <label>{t("set.expiringSoonWarning")}</label>
          <input className="input" type="number" min={1} value={expiringSoonDays} onChange={(e) => setExpiringSoonDays(Math.max(1, parseInt(e.target.value) || 1))} />
        </div>
        <div className="field">
          <label>{t("set.lotCalculation")}</label>
          <select className="input" value={lotCalculationMode} onChange={(e) => setLotCalculationMode(e.target.value as LotCalculationMode)}>
            <option value="sum_all_verified">{t("set.lotCalc.sumAll")}</option>
            <option value="selected_only">{t("set.lotCalc.selectedOnly")}</option>
          </select>
        </div>
      </div>
      <div className="set-row" style={{ borderBottom: "none", paddingBottom: 0 }}>
        <div>
          <div className="t">{t("set.autoRenewal")}</div>
          <div className="d">{t("set.autoRenewalDesc")}</div>
        </div>
        <label className="switch">
          <input type="checkbox" checked={autoRenewalEnabled} onChange={(e) => setAutoRenewalEnabled(e.target.checked)} />
          <span className="track"></span>
        </label>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button
          className="btn btn-primary"
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? "Saving..." : t("set.saveIndicatorSettings")}
        </button>
      </div>
    </div>
  );
}

export default function IndicatorsPage() {
  const { crmDataStatus } = useCrm();

  if (crmDataStatus === "loading") return <IndicatorsSkeleton />;

  return (
    <section className="panel is-active">
      <IndicatorsCard />
      <PlansCard />
      <IndicatorSettingsCard />
    </section>
  );
}
