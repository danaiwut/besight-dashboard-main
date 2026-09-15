"use client";

import { useRef, useState } from "react";
import { useCrm, brokerInitials, accountLots, lot, type Broker } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
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
  const { brokers, setBrokers, tradeAccounts, tradeLogs, toast } = useCrm();
  const { t } = useLanguage();
  const formRef = useRef<BrokerFormHandle>(null);

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
                  onClick={() => {
                    setBrokers((cur) => cur.filter((x) => x.id !== b.id));
                    toast(t("br.toast.removed", { name: b.name }));
                  }}
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
                    onBlur={(e) => setBrokers((cur) => cur.map((x) => (x.id === b.id ? { ...x, code: e.target.value.trim() } : x)))}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>{t("br.openAccountLink")}</label>
                  <input
                    className="input"
                    defaultValue={b.url}
                    placeholder="https://…"
                    onBlur={(e) => setBrokers((cur) => cur.map((x) => (x.id === b.id ? { ...x, url: e.target.value.trim() } : x)))}
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
  const [drawerOpen, setDrawerOpen] = useState<{ broker: Broker | null } | null>(null);

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
