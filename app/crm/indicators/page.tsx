"use client";

import { useEffect, useRef, useState } from "react";
import { useCrm, PLAN_LABELS, fmtDate, type Indicator, type LotCalculationMode, type Plan } from "../../../components/crm/CrmContext";
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
                {ind.eaFile && (
                  <>
                    {" "}· <a href={ind.eaFile} target="_blank" rel="noopener noreferrer" className="status-pill published" style={{ textDecoration: "none" }}>EA ↗</a>
                  </>
                )}
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
  // Legacy stored value "sum_all_verified" counts the same as "sum_all_active".
  const [lotCalculationMode, setLotCalculationMode] = useState<LotCalculationMode>(
    settings.lotCalculationMode === "selected_only" ? "selected_only" : "sum_all_active",
  );
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
    const draft = { requiredLots, renewalPeriodMonths, expiringSoonDays, autoRenewalEnabled, lotCalculationMode };
    try {
      if (!backendLive) {
        setSettings((current) => ({ ...current, ...draft }));
        toast(t("set.toast.indicatorSaved"));
        return;
      }
      // Automation fields live on the indicator-automation setting; the
      // expiring window + lot-calc mode live on the general setting — both
      // must be written or those two controls silently revert on refresh.
      await apiCall("/api/crm/settings/indicator-automation/", "PUT", {
        requiredLots,
        renewalMonths: renewalPeriodMonths,
        enabled: autoRenewalEnabled,
      });
      await apiCall("/api/crm/settings/general/", "PUT", { expiringSoonDays, lotCalculationMode });
      setSettings((current) => ({ ...current, ...draft }));
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
            <option value="sum_all_active">{t("set.lotCalc.sumAll")}</option>
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

type EaPolicy = { text: string; version: number; updatedAt: string | null; updatedBy: string | null };

/** EA download policy — members must accept this text before an indicator's
 *  EA link is released. Each change bumps the version; acceptances are logged
 *  in Activity Logs as "EA Policy Accepted" with the exact wording agreed to. */
function EaPolicyCard() {
  const { toast, backendLive } = useCrm();
  const { t } = useLanguage();
  const [policy, setPolicy] = useState<EaPolicy | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!backendLive) return;
    let cancelled = false;
    apiCall<{ policy: EaPolicy }>("/api/crm/settings/ea-policy/", "GET")
      .then((payload) => {
        if (cancelled) return;
        setPolicy(payload.policy);
        setDraft(payload.policy.text);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Unable to load EA policy"));
    return () => { cancelled = true; };
  }, [backendLive]);

  async function save() {
    if (!draft.trim()) {
      toast(t("set.eaPolicy.required"));
      return;
    }
    setSaving(true);
    try {
      const payload = await apiCall<{ policy: EaPolicy }>("/api/crm/settings/ea-policy/", "PUT", { text: draft });
      setPolicy(payload.policy);
      setDraft(payload.policy.text);
      toast(t("set.eaPolicy.saved", { v: payload.policy.version }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unable to save EA policy");
    } finally {
      setSaving(false);
    }
  }

  const dirty = policy ? draft.trim() !== policy.text.trim() : false;

  return (
    <div className="card" style={{ padding: 22, marginBottom: 22 }}>
      <div className="settings-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h3>{t("set.eaPolicy.title")}</h3>
          <div className="desc" style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 2 }}>
            {t("set.eaPolicy.desc")}
          </div>
        </div>
        {policy && (
          <span className="status-pill published">
            {t("set.eaPolicy.version", { v: policy.version })}
            {policy.updatedAt ? ` · ${fmtDate(policy.updatedAt.slice(0, 10))}` : ""}
          </span>
        )}
      </div>
      {error ? (
        <div style={{ color: "var(--red)", fontSize: 13, marginTop: 12 }}>{error}</div>
      ) : (
        <>
          <textarea
            className="input"
            style={{ width: "100%", minHeight: 260, marginTop: 14, fontFamily: "inherit", lineHeight: 1.6, resize: "vertical" }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!policy}
            aria-label={t("set.eaPolicy.title")}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
            <div style={{ fontSize: 12, color: "var(--text-sub)" }}>{t("set.eaPolicy.hint")}</div>
            <button className="btn btn-primary" onClick={() => void save()} disabled={!policy || !dirty || saving}>
              {saving ? "Saving..." : t("set.eaPolicy.save")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function IndicatorsPage() {
  const { crmDataStatus } = useCrm();

  if (crmDataStatus === "loading") return <IndicatorsSkeleton />;

  return (
    <section className="panel is-active">
      <IndicatorsCard />
      <EaPolicyCard />
      <PlansCard />
      <IndicatorSettingsCard />
    </section>
  );
}
