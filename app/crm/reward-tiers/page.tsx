"use client";

import { useCallback, useEffect, useState } from "react";
import { useCrm } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { TableSkeleton } from "../../../components/crm/Skeletons";
import Drawer from "../../../components/crm/Drawer";
import { apiCall } from "../../../lib/crmApi";
import type { RewardTierDto } from "../../../lib/activities";
import Icon from "../../../components/Icon";

type TierDraft = {
  key: string;
  title: string;
  titleEn: string;
  threshold: string;
  reward: string;
  rewardEn: string;
  icon: string;
  image: string;
  accent: string;
  sortOrder: number;
  active: boolean;
};

const EMPTY_TIER: TierDraft = {
  key: "", title: "", titleEn: "", threshold: "0", reward: "", rewardEn: "",
  icon: "military_tech", image: "", accent: "#2F6FED", sortOrder: 0, active: true,
};

function toDraft(tier: RewardTierDto): TierDraft {
  return {
    key: tier.key, title: tier.title, titleEn: tier.titleEn ?? "", threshold: String(tier.threshold),
    reward: tier.reward, rewardEn: tier.rewardEn ?? "", icon: tier.icon, image: tier.image ?? "",
    accent: tier.accent, sortOrder: tier.sortOrder, active: tier.active,
  };
}

/** Admin-managed loyalty ladder — the dashboard rewards page reads this, so
 *  thresholds/names/prizes never need a code change again. */
export default function CrmRewardTiersPage() {
  const { t } = useLanguage();
  const { toast, log, dataVersion, crmDataStatus } = useCrm();
  const [tiers, setTiers] = useState<RewardTierDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draftIndex, setDraftIndex] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<TierDraft>(EMPTY_TIER);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const payload = await apiCall<{ tiers: RewardTierDto[] }>("/api/crm/reward-tiers/", "GET");
      setTiers(payload.tiers);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load tiers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (crmDataStatus === "loading") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [crmDataStatus, dataVersion, load]);

  function openDraft(index: number | "new") {
    setDraftIndex(index);
    setDraft(index === "new" ? { ...EMPTY_TIER, sortOrder: tiers.length } : toDraft(tiers[index]));
  }

  async function persist(next: RewardTierDto[]) {
    setSaving(true);
    try {
      const payload = await apiCall<{ tiers: RewardTierDto[] }>("/api/crm/reward-tiers/", "PUT", {
        tiers: next.map((tier, i) => ({ ...tier, sortOrder: i })),
      });
      setTiers(payload.tiers);
      setDraftIndex(null);
      log({ actor: "Admin", action: "Reward Tiers Updated", description: `Loyalty ladder saved (${payload.tiers.length} tiers).` });
      toast(t("rw.tiers.saved"));
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : "Unable to save tiers");
    } finally {
      setSaving(false);
    }
  }

  function saveDraft() {
    const threshold = Math.max(0, parseFloat(draft.threshold) || 0);
    const row: RewardTierDto = {
      id: 0, key: draft.key.trim().toLowerCase(), title: draft.title.trim(), titleEn: draft.titleEn.trim() || undefined,
      threshold, reward: draft.reward.trim(), rewardEn: draft.rewardEn.trim() || undefined,
      icon: draft.icon.trim() || "military_tech", image: draft.image.trim() || undefined,
      accent: draft.accent.trim() || "#2F6FED", sortOrder: draft.sortOrder, active: draft.active,
    };
    if (!row.key || !row.title || !row.reward) {
      toast(t("rw.tiers.required"));
      return;
    }
    const next = draftIndex === "new" ? [...tiers, row] : tiers.map((tier, i) => (i === draftIndex ? row : tier));
    void persist(next);
  }

  function remove(index: number) {
    if (tiers.length <= 1) {
      toast(t("rw.tiers.minOne"));
      return;
    }
    if (!window.confirm(t("common.delete") + "?")) return;
    void persist(tiers.filter((_, i) => i !== index));
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...tiers];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    void persist(next);
  }

  if (crmDataStatus === "loading" || loading) {
    return (
      <section className="panel is-active">
        <TableSkeleton cols={5} rows={5} minWidth={900} />
      </section>
    );
  }

  const set = (patch: Partial<TierDraft>) => setDraft((cur) => ({ ...cur, ...patch }));

  return (
    <section className="panel is-active">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
        <button className="btn btn-primary" onClick={() => openDraft("new")}>
          <Icon name="add" />
          {t("rw.tiers.add")}
        </button>
      </div>

      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16, color: "var(--red)" }}>
          {error}
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>{t("rw.tiers.col.tier")}</th>
                <th>{t("rw.tiers.col.threshold")}</th>
                <th>{t("rw.tiers.col.reward")}</th>
                <th>{t("rw.tiers.col.active")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tiers.length ? (
                tiers.map((tier, i) => (
                  <tr key={tier.key}>
                    <td>
                      <div className="cn">{tier.title}</div>
                      <div className="ce mono">{tier.key}</div>
                    </td>
                    <td className="mono">{Number(tier.threshold).toFixed(2)} lots</td>
                    <td>{tier.reward}</td>
                    <td>
                      <span className={`badge ${tier.active ? "active" : "suspended"}`}>
                        {tier.active ? t("common.active") : t("common.inactive")}
                      </span>
                    </td>
                    <td className="row-actions">
                      <button className="kebab" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                        <Icon name="arrow_upward" />
                      </button>
                      <button className="kebab" aria-label="Move down" disabled={i === tiers.length - 1} onClick={() => move(i, 1)}>
                        <Icon name="arrow_downward" />
                      </button>
                      <button className="kebab" aria-label={t("common.edit")} onClick={() => openDraft(i)}>
                        <Icon name="edit" />
                      </button>
                      <button className="kebab" aria-label={t("common.delete")} onClick={() => remove(i)}>
                        <Icon name="delete" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    <div className="table-empty">{t("rw.tiers.empty")}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer
        open={draftIndex !== null}
        title={draftIndex === "new" ? t("rw.tiers.add") : t("rw.tiers.edit")}
        onClose={() => setDraftIndex(null)}
        body={
          <>
            <div className="form-grid2">
              <div className="field">
                <label>{t("rw.tiers.field.key")}</label>
                <input className="input mono" value={draft.key} onChange={(e) => set({ key: e.target.value })} placeholder="gold" disabled={draftIndex !== "new"} />
              </div>
              <div className="field">
                <label>{t("rw.tiers.field.threshold")}</label>
                <input className="input" type="number" min={0} step="0.01" value={draft.threshold} onChange={(e) => set({ threshold: e.target.value })} />
              </div>
            </div>
            <div className="form-grid2">
              <div className="field">
                <label>{t("rw.tiers.field.title")}</label>
                <input className="input" value={draft.title} onChange={(e) => set({ title: e.target.value })} />
              </div>
              <div className="field">
                <label>{t("rw.tiers.field.titleEn")}</label>
                <input className="input" value={draft.titleEn} onChange={(e) => set({ titleEn: e.target.value })} />
              </div>
            </div>
            <div className="form-grid2">
              <div className="field">
                <label>{t("rw.tiers.field.reward")}</label>
                <input className="input" value={draft.reward} onChange={(e) => set({ reward: e.target.value })} />
              </div>
              <div className="field">
                <label>{t("rw.tiers.field.rewardEn")}</label>
                <input className="input" value={draft.rewardEn} onChange={(e) => set({ rewardEn: e.target.value })} />
              </div>
            </div>
            <div className="form-grid2">
              <div className="field">
                <label>{t("rw.tiers.field.icon")}</label>
                <input className="input mono" value={draft.icon} onChange={(e) => set({ icon: e.target.value })} />
              </div>
              <div className="field">
                <label>{t("rw.tiers.field.accent")}</label>
                <input className="input mono" value={draft.accent} onChange={(e) => set({ accent: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>{t("rw.tiers.field.image")}</label>
              <input className="input" value={draft.image} onChange={(e) => set({ image: e.target.value })} placeholder="https://… (/img/…)" />
            </div>
            <div className="field">
              <label className="pop-toggle" style={{ marginTop: 6 }}>
                <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} /> {t("rw.tiers.field.active")}
              </label>
            </div>
          </>
        }
        foot={
          <>
            <button className="btn btn-ghost" onClick={() => setDraftIndex(null)}>
              {t("common.cancel")}
            </button>
            <button className="btn btn-primary" disabled={saving} onClick={saveDraft}>
              {t("common.save")}
            </button>
          </>
        }
      />
    </section>
  );
}
