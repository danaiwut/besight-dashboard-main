"use client";

import { useCallback, useEffect, useState } from "react";
import { useCrm } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { TableSkeleton } from "../../../components/crm/Skeletons";
import Drawer from "../../../components/crm/Drawer";
import { apiCall } from "../../../lib/crmApi";
import type { BecRateDto, SpinPrizeDto, SpinResultDto, SpinSettings, SpinStatus } from "../../../lib/spin";
import Icon from "../../../components/Icon";

type PrizeDraft = {
  id: number | null;
  name: string;
  icon: string;
  image: string;
  valueNote: string;
  weight: number;
  stock: string;
  sortOrder: number;
  active: boolean;
};

const EMPTY_PRIZE: PrizeDraft = { id: null, name: "", icon: "redeem", image: "", valueNote: "", weight: 1, stock: "", sortOrder: 0, active: true };

const STATUS_BADGE: Record<SpinStatus, string> = { pending: "pending", fulfilled: "active", cancelled: "suspended" };

export default function CrmSpinPage() {
  const { t } = useLanguage();
  const { toast, log, dataVersion, crmDataStatus } = useCrm();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [settings, setSettings] = useState<SpinSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const [prizes, setPrizes] = useState<SpinPrizeDto[]>([]);
  const [draft, setDraft] = useState<PrizeDraft | null>(null);
  const [savingPrize, setSavingPrize] = useState(false);

  const [rates, setRates] = useState<BecRateDto[]>([]);
  const [rateSymbol, setRateSymbol] = useState("");
  const [ratePoints, setRatePoints] = useState("1");
  const [seeding, setSeeding] = useState(false);

  const [statusFilter, setStatusFilter] = useState<"all" | SpinStatus>("all");
  const [results, setResults] = useState<SpinResultDto[]>([]);
  const [summary, setSummary] = useState({ pending: 0, fulfilled: 0, cancelled: 0, total: 0 });

  const load = useCallback(async () => {
    try {
      const [settingsPayload, prizesPayload, ratesPayload, resultsPayload] = await Promise.all([
        apiCall<{ settings: SpinSettings }>("/api/crm/spin/settings/", "GET"),
        apiCall<{ prizes: SpinPrizeDto[] }>("/api/crm/spin/prizes/", "GET"),
        apiCall<{ rates: BecRateDto[] }>("/api/crm/spin/rates/", "GET"),
        apiCall<{ results: SpinResultDto[]; summary: typeof summary }>(`/api/crm/spin/results/?status=${statusFilter === "all" ? "" : statusFilter}`, "GET"),
      ]);
      setSettings(settingsPayload.settings);
      setPrizes(prizesPayload.prizes);
      setRates(ratesPayload.rates);
      setResults(resultsPayload.results);
      setSummary(resultsPayload.summary);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load spin data");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (crmDataStatus === "loading") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [crmDataStatus, dataVersion, load]);

  async function saveSettings() {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const payload = await apiCall<{ settings: SpinSettings }>("/api/crm/spin/settings/", "PUT", settings);
      setSettings(payload.settings);
      toast(t("spin.set.saved"));
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : "Unable to save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function savePrize() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      toast(t("spin.prizes.nameRequired"));
      return;
    }
    setSavingPrize(true);
    const body = {
      name,
      icon: draft.icon.trim() || "redeem",
      image: draft.image.trim(),
      valueNote: draft.valueNote.trim(),
      weight: Math.max(1, draft.weight),
      stock: draft.stock.trim() === "" ? null : Math.max(0, parseInt(draft.stock) || 0),
      sortOrder: draft.sortOrder,
      active: draft.active,
    };
    try {
      if (draft.id) {
        const payload = await apiCall<{ prize: SpinPrizeDto }>(`/api/crm/spin/prizes/${draft.id}/`, "PUT", body);
        setPrizes((cur) => cur.map((p) => (p.id === payload.prize.id ? payload.prize : p)));
      } else {
        const payload = await apiCall<{ prize: SpinPrizeDto }>("/api/crm/spin/prizes/", "POST", body);
        setPrizes((cur) => [...cur, payload.prize]);
      }
      log({ actor: "Admin", action: draft.id ? "Spin Prize Updated" : "Spin Prize Added", description: `Prize "${name}" ${draft.id ? "updated" : "created"}.` });
      toast(t("spin.prizes.saved"));
      setDraft(null);
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : "Unable to save prize");
    } finally {
      setSavingPrize(false);
    }
  }

  async function removePrize(prize: SpinPrizeDto) {
    if (!window.confirm(t("spin.prizes.removeConfirm", { name: prize.name }))) return;
    try {
      await apiCall(`/api/crm/spin/prizes/${prize.id}/`, "DELETE");
      setPrizes((cur) => cur.filter((p) => p.id !== prize.id));
      toast(t("spin.prizes.removed"));
    } catch (removeError) {
      toast(removeError instanceof Error ? removeError.message : "Unable to remove prize");
    }
  }

  async function addRate() {
    const symbol = rateSymbol.trim().toUpperCase();
    if (!symbol) return;
    try {
      const payload = await apiCall<{ rate: BecRateDto }>("/api/crm/spin/rates/", "POST", { symbol, pointsPerLot: Number(ratePoints) || 0 });
      setRates((cur) => {
        const exists = cur.some((r) => r.id === payload.rate.id);
        const next = exists ? cur.map((r) => (r.id === payload.rate.id ? payload.rate : r)) : [...cur, payload.rate];
        return next.sort((a, b) => a.symbol.localeCompare(b.symbol));
      });
      setRateSymbol("");
      toast(t("spin.rates.saved"));
    } catch (rateError) {
      toast(rateError instanceof Error ? rateError.message : "Unable to save rate");
    }
  }

  async function seedRates() {
    setSeeding(true);
    try {
      const payload = await apiCall<{ imported: number }>("/api/crm/spin/rates/", "POST", { seedDefaults: true });
      toast(t("spin.rates.seeded", { n: payload.imported }));
      const refreshed = await apiCall<{ rates: BecRateDto[] }>("/api/crm/spin/rates/", "GET");
      setRates(refreshed.rates);
    } catch (seedError) {
      toast(seedError instanceof Error ? seedError.message : "Unable to import rates");
    } finally {
      setSeeding(false);
    }
  }

  async function removeRate(rate: BecRateDto) {
    if (!window.confirm(t("spin.rates.removeConfirm", { symbol: rate.symbol }))) return;
    try {
      await apiCall(`/api/crm/spin/rates/${rate.id}/`, "DELETE");
      setRates((cur) => cur.filter((r) => r.id !== rate.id));
      toast(t("spin.rates.removed"));
    } catch (removeError) {
      toast(removeError instanceof Error ? removeError.message : "Unable to remove rate");
    }
  }

  async function setResultStatus(result: SpinResultDto, status: SpinStatus) {
    try {
      const payload = await apiCall<{ result: SpinResultDto }>(`/api/crm/spin/results/${result.id}/`, "PATCH", { status });
      setResults((cur) => cur.map((r) => (r.id === payload.result.id ? payload.result : r)));
      toast(t(status === "fulfilled" ? "spin.results.fulfilled" : "spin.results.cancelled"));
    } catch (updateError) {
      toast(updateError instanceof Error ? updateError.message : "Unable to update result");
    }
  }

  if (crmDataStatus === "loading" || loading) {
    return (
      <section className="panel is-active">
        <TableSkeleton cols={6} rows={6} minWidth={900} />
      </section>
    );
  }

  return (
    <section className="panel is-active">
      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16, color: "var(--red)" }}>
          {error}
        </div>
      )}

      {/* ── Settings ── */}
      {settings && (
        <div className="card" style={{ padding: 22, marginBottom: 22 }}>
          <div className="settings-head">
            <h3>{t("spin.set.title")}</h3>
            <div className="desc" style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 2 }}>{t("spin.set.desc")}</div>
          </div>
          <div className="form-grid2">
            <div className="field">
              <label>{t("spin.set.cost")}</label>
              <input className="input" type="number" min={0} step="0.01" value={settings.costPerSpin} onChange={(e) => setSettings({ ...settings, costPerSpin: Math.max(0, parseFloat(e.target.value) || 0) })} />
            </div>
            <div className="field">
              <label>{t("spin.set.defaultRate")}</label>
              <input className="input" type="number" min={0} step="0.01" value={settings.defaultPointsPerLot} onChange={(e) => setSettings({ ...settings, defaultPointsPerLot: Math.max(0, parseFloat(e.target.value) || 0) })} />
            </div>
            <div className="field">
              <label>{t("spin.set.minWithdraw")}</label>
              <input className="input" type="number" min={0} step="1" value={settings.minWithdraw} onChange={(e) => setSettings({ ...settings, minWithdraw: Math.max(0, parseFloat(e.target.value) || 0) })} />
            </div>
            <div className="field">
              <label>{t("spin.set.enabled")}</label>
              <label className="pop-toggle" style={{ marginTop: 6 }}>
                <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
                {settings.enabled ? t("common.active") : t("common.inactive")}
              </label>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => void saveSettings()} disabled={savingSettings}>
              {t("common.saveChanges")}
            </button>
          </div>
        </div>
      )}

      {/* ── Prizes ── */}
      <div className="card" style={{ padding: 22, marginBottom: 22 }}>
        <div className="settings-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div>
            <h3>{t("spin.prizes.title")}</h3>
            <div className="desc" style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 2 }}>{t("spin.prizes.desc")}</div>
          </div>
          <button className="btn btn-primary" onClick={() => setDraft({ ...EMPTY_PRIZE, sortOrder: prizes.length })}>
            <Icon name="add" />
            {t("spin.prizes.add")}
          </button>
        </div>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th>{t("spin.prizes.col.name")}</th>
                <th>{t("spin.prizes.col.value")}</th>
                <th>{t("spin.prizes.col.weight")}</th>
                <th>{t("spin.prizes.col.stock")}</th>
                <th>{t("spin.prizes.col.active")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {prizes.length ? (
                prizes.map((prize) => (
                  <tr key={prize.id}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {prize.image ? (
                          // eslint-disable-next-line @next/next/no-img-element -- admin-provided prize image
                          <img src={prize.image} alt="" style={{ width: 24, height: 24, borderRadius: 6, objectFit: "cover" }} />
                        ) : (
                          <Icon name={prize.icon} />
                        )}
                        {prize.name}
                      </span>
                    </td>
                    <td>{prize.valueNote || "—"}</td>
                    <td className="mono">{prize.weight}</td>
                    <td className="mono">{prize.stock === null ? t("spin.prizes.stockUnlimited") : prize.stock}</td>
                    <td>
                      <span className={`badge ${prize.active ? "active" : "suspended"}`}>{prize.active ? t("common.active") : t("common.inactive")}</span>
                    </td>
                    <td className="row-actions">
                      <button
                        className="kebab"
                        aria-label={t("common.edit")}
                        onClick={() => setDraft({ id: prize.id, name: prize.name, icon: prize.icon, image: prize.image ?? "", valueNote: prize.valueNote ?? "", weight: prize.weight, stock: prize.stock === null ? "" : String(prize.stock), sortOrder: prize.sortOrder, active: prize.active })}
                      >
                        <Icon name="edit" />
                      </button>
                      <button className="kebab" aria-label={t("common.delete")} onClick={() => void removePrize(prize)}>
                        <Icon name="delete" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="table-empty">{t("spin.prizes.empty")}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── BEC rates ── */}
      <div className="card" style={{ padding: 22, marginBottom: 22 }}>
        <div className="settings-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div>
            <h3>{t("spin.rates.title")}</h3>
            <div className="desc" style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 2 }}>{t("spin.rates.desc")}</div>
          </div>
          <button className="btn btn-ghost" onClick={() => void seedRates()} disabled={seeding}>
            <Icon name="download" />
            {t("spin.rates.seed")}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
          <input className="input" style={{ maxWidth: 200 }} placeholder={t("spin.rates.symbol")} value={rateSymbol} onChange={(e) => setRateSymbol(e.target.value.toUpperCase())} />
          <input className="input" style={{ maxWidth: 160 }} type="number" min={0} step="0.01" placeholder={t("spin.rates.points")} value={ratePoints} onChange={(e) => setRatePoints(e.target.value)} />
          <button className="btn btn-primary" onClick={() => void addRate()} disabled={!rateSymbol.trim()}>
            <Icon name="add" />
            {t("spin.rates.add")}
          </button>
        </div>
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 520 }}>
            <thead>
              <tr>
                <th>{t("spin.rates.symbol")}</th>
                <th>{t("spin.rates.points")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rates.length ? (
                rates.map((rate) => (
                  <tr key={rate.id}>
                    <td className="mono">{rate.symbol}</td>
                    <td className="mono">{rate.pointsPerLot}</td>
                    <td className="row-actions">
                      <button className="kebab" aria-label={t("common.delete")} onClick={() => void removeRate(rate)}>
                        <Icon name="delete" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3}>
                    <div className="table-empty">{t("spin.rates.empty")}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Results ── */}
      <div className="card" style={{ padding: 22 }}>
        <div className="settings-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div>
            <h3>{t("spin.results.title")}</h3>
            <div className="desc" style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 2 }}>
              {t("spin.results.desc", { pending: summary.pending, total: summary.total })}
            </div>
          </div>
          <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | SpinStatus)} aria-label={t("spin.results.filter")}>
            <option value="all">{t("spin.results.filter")}</option>
            <option value="pending">{t("spin.status.pending")}</option>
            <option value="fulfilled">{t("spin.status.fulfilled")}</option>
            <option value="cancelled">{t("spin.status.cancelled")}</option>
          </select>
        </div>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>{t("spin.results.col.member")}</th>
                <th>{t("spin.results.col.prize")}</th>
                <th>{t("spin.results.col.cost")}</th>
                <th>{t("spin.results.col.status")}</th>
                <th>{t("spin.results.col.when")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.length ? (
                results.map((result) => (
                  <tr key={result.id}>
                    <td>
                      <div className="cn">{result.memberName}</div>
                      <div className="ce mono">{result.memberCode}</div>
                    </td>
                    <td>{result.prizeName}</td>
                    <td className="mono">{result.cost.toFixed(2)}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[result.status]}`}>{t(`spin.status.${result.status}`)}</span>
                    </td>
                    <td className="mono">{new Date(result.spunAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="row-actions">
                      {result.status !== "fulfilled" && (
                        <button className="kebab" aria-label={t("spin.results.fulfil")} title={t("spin.results.fulfil")} onClick={() => void setResultStatus(result, "fulfilled")}>
                          <Icon name="check_circle" />
                        </button>
                      )}
                      {result.status !== "cancelled" && (
                        <button className="kebab" aria-label={t("spin.results.cancel")} title={t("spin.results.cancel")} onClick={() => void setResultStatus(result, "cancelled")}>
                          <Icon name="cancel" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="table-empty">{t("spin.results.empty")}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer
        open={!!draft}
        title={draft?.id ? t("spin.prizes.edit") : t("spin.prizes.add")}
        onClose={() => setDraft(null)}
        body={
          draft && (
            <>
              <div className="field">
                <label>{t("spin.prizes.col.name")}</label>
                <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="เช่น $15 Bonus Rebate" />
              </div>
              <div className="field">
                <label>{t("spin.prizes.col.value")}</label>
                <input className="input" value={draft.valueNote} onChange={(e) => setDraft({ ...draft, valueNote: e.target.value })} placeholder="$15.00" />
              </div>
              <div className="form-grid2">
                <div className="field">
                  <label>{t("spin.prizes.col.weight")}</label>
                  <input className="input" type="number" min={1} value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: Math.max(1, parseInt(e.target.value) || 1) })} />
                </div>
                <div className="field">
                  <label>{t("spin.prizes.col.stock")}</label>
                  <input className="input" type="number" min={0} value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} placeholder={t("spin.prizes.stockUnlimited")} />
                </div>
              </div>
              <div className="field">
                <label>{t("spin.prizes.col.icon")}</label>
                <input className="input" value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} placeholder="redeem" />
              </div>
              <div className="field">
                <label>{t("spin.prizes.col.image")}</label>
                <input className="input" value={draft.image} onChange={(e) => setDraft({ ...draft, image: e.target.value })} placeholder="https://..." />
              </div>
              <div className="form-grid2">
                <div className="field">
                  <label>{t("spin.prizes.col.sort")}</label>
                  <input className="input" type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="field">
                  <label>{t("spin.prizes.col.active")}</label>
                  <label className="pop-toggle" style={{ marginTop: 6 }}>
                    <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                    {draft.active ? t("common.active") : t("common.inactive")}
                  </label>
                </div>
              </div>
            </>
          )
        }
        foot={
          draft && (
            <>
              <button className="btn btn-ghost" onClick={() => setDraft(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={() => void savePrize()} disabled={savingPrize}>
                {draft.id ? t("common.saveChanges") : t("spin.prizes.add")}
              </button>
            </>
          )
        }
      />
    </section>
  );
}
