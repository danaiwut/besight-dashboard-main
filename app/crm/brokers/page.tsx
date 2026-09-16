"use client";

import { useRef, useState } from "react";
import { useCrm, brokerInitials, accountLots, lot, type Broker } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { BrokersSkeleton } from "../../../components/crm/Skeletons";
import { apiCall } from "../../../lib/crmApi";
import Icon from "../../../components/Icon";
import Drawer from "../../../components/crm/Drawer";
import BrokerForm, { type BrokerFormHandle } from "../../../components/crm/BrokerForm";

function BrokerLogo({ broker }: { broker: Broker }) {
  const [failed, setFailed] = useState(false);
  if (!broker.logo || failed) return <span className="bk-mono">{brokerInitials(broker.name)}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- broker partner logo, arbitrary aspect ratio
    <img src={broker.logo} alt={broker.name} onError={() => setFailed(true)} />
  );
}

function BrokerDirectory({
  drawerOpen,
  setDrawerOpen,
}: {
  drawerOpen: { broker: Broker | null } | null;
  setDrawerOpen: (v: { broker: Broker | null } | null) => void;
}) {
  const { brokers, setBrokers, tradeAccounts, tradeLogs, toast, backendLive } = useCrm();
  const { t } = useLanguage();
  const formRef = useRef<BrokerFormHandle>(null);

  async function removeBroker(id: number, name: string) {
    if (!backendLive) {
      setBrokers((cur) => cur.filter((x) => x.id !== id));
      toast(t("br.toast.removed", { name }));
      return;
    }
    try {
      await apiCall(`/api/crm/brokers/${id}/`, "DELETE");
      setBrokers((cur) => cur.filter((x) => x.id !== id));
      toast(t("br.toast.removed", { name }));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to delete broker");
    }
  }

  async function saveBrokerField(id: number, patch: { code?: string; url?: string }) {
    if (!backendLive) {
      setBrokers((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      return;
    }
    try {
      const payload = await apiCall<{ broker: Broker }>(`/api/crm/brokers/${id}/`, "PUT", patch);
      setBrokers((cur) => cur.map((x) => (x.id === id ? payload.broker : x)));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to save broker");
    }
  }

  return (
    <>
      <div className="broker-grid2">
        {brokers.map((b) => {
          const accts = tradeAccounts.filter((a) => a.brokerId === b.id);
          const memberIds = new Set(accts.map((a) => a.memberId));
          const lots = accts.reduce((s, a) => s + accountLots(a.id, tradeLogs), 0);
          const verified = accts.filter((a) => a.verification === "verified").length;
          return (
            <div className="bk-card" key={b.id}>
              <div className="bk-top">
                <span className="bk-logo">
                  <BrokerLogo broker={b} />
                </span>
                <div>
                  <div className="bk-name">{b.name}</div>
                  <div className="bk-sub">
                    {memberIds.size} {t("br.membersSuffix")} · {b.importMethod}
                  </div>
                </div>
                <button
                  className="kebab bk-del"
                  aria-label={t("br.deleteBroker")}
                  style={{ marginLeft: "auto" }}
                  onClick={() => void removeBroker(b.id, b.name)}
                >
                  <Icon name="delete" />
                </button>
              </div>
              <div className="bk-stats">
                <div className="bk-stat">
                  <div className="v">{memberIds.size}</div>
                  <div className="l">{t("br.stat.members")}</div>
                </div>
                <div className="bk-stat">
                  <div className="v">{accts.length}</div>
                  <div className="l">{t("br.stat.tradeAccounts")}</div>
                </div>
                <div className="bk-stat">
                  <div className="v">{lot(lots)}</div>
                  <div className="l">{t("br.stat.monthlyLots")}</div>
                </div>
                <div className="bk-stat">
                  <div className="v">{verified}</div>
                  <div className="l">{t("br.stat.verifiedAccounts")}</div>
                </div>
              </div>
              <div className="bk-edit">
                <div className="field">
                  <label>{t("br.partnerCode")}</label>
                  <input
                    className="input"
                    defaultValue={b.code}
                    placeholder="e.g. BS-XXXX"
                    onBlur={(e) => {
                      const code = e.target.value.trim();
                      if (code !== b.code) void saveBrokerField(b.id, { code });
                    }}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>{t("br.openAccountLink")}</label>
                  <input
                    className="input"
                    defaultValue={b.url}
                    placeholder="https://…"
                    onBlur={(e) => {
                      const url = e.target.value.trim();
                      if (url !== b.url) void saveBrokerField(b.id, { url });
                    }}
                  />
                </div>
                <button className="btn btn-ghost bk-save" style={{ width: "100%", marginTop: 12 }} onClick={() => toast(t("br.toast.updated", { name: b.name }))}>
                  {t("common.save")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Drawer
        open={!!drawerOpen}
        title={drawerOpen?.broker ? t("br.drawer.edit") : t("br.drawer.add")}
        onClose={() => setDrawerOpen(null)}
        body={drawerOpen ? <BrokerForm ref={formRef} broker={drawerOpen.broker} onDone={() => setDrawerOpen(null)} /> : null}
        foot={
          drawerOpen && (
            <>
              <button className="btn btn-ghost" onClick={() => setDrawerOpen(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={() => formRef.current?.save()}>
                {drawerOpen.broker ? t("common.saveChanges") : t("br.addBroker")}
              </button>
            </>
          )
        }
      />
    </>
  );
}

export default function BrokersPage() {
  const { t } = useLanguage();
  const { crmDataStatus } = useCrm();
  const [drawerOpen, setDrawerOpen] = useState<{ broker: Broker | null } | null>(null);

  if (crmDataStatus === "loading") return <BrokersSkeleton />;

  return (
    <section className="panel is-active">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
        <button className="btn btn-primary" onClick={() => setDrawerOpen({ broker: null })}>
          <Icon name="add" />
          {t("br.addBroker")}
        </button>
      </div>
      <BrokerDirectory drawerOpen={drawerOpen} setDrawerOpen={setDrawerOpen} />
    </section>
  );
}
