"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useCrm, brokerInitials, type Broker } from "./CrmContext";
import { useLanguage } from "./LanguageContext";
import Icon from "../Icon";

export type BrokerFormHandle = { save: () => void };

const BrokerForm = forwardRef<BrokerFormHandle, { broker: Broker | null; onDone: () => void }>(
  function BrokerForm({ broker, onDone }, ref) {
    const { setBrokers, toast } = useCrm();
    const { t } = useLanguage();
    const isNew = !broker;
    const [name, setName] = useState(broker?.name ?? "");
    const [logo, setLogo] = useState(broker?.logo ?? "");
    const [logoUrlInput, setLogoUrlInput] = useState(broker?.logo && broker.logo.indexOf("data:") !== 0 ? broker.logo : "");
    const [code, setCode] = useState(broker?.code ?? "");
    const [url, setUrl] = useState(broker?.url ?? "");
    const [importMethod, setImportMethod] = useState(broker?.importMethod ?? "CSV Import");

    function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
      const f = e.target.files?.[0];
      if (!f) return;
      if (!f.type.startsWith("image/")) {
        toast(t("br.form.imageFileRequired"));
        return;
      }
      if (f.size > 512 * 1024) {
        toast(t("br.form.imageTooLarge"));
        return;
      }
      const r = new FileReader();
      r.onload = () => {
        if (typeof r.result === "string") {
          setLogo(r.result);
          setLogoUrlInput("");
        }
      };
      r.readAsDataURL(f);
    }

    useImperativeHandle(ref, () => ({
      save() {
        const trimmedName = name.trim();
        if (!trimmedName) {
          toast(t("br.toast.nameRequired"));
          return;
        }
        const data = { name: trimmedName, logo, code: code.trim(), url: url.trim(), importMethod };
        if (isNew) {
          setBrokers((cur) => [...cur, { id: Math.max(0, ...cur.map((b) => b.id)) + 1, status: "active" as const, ...data }]);
          toast(t("br.toast.added"));
        } else {
          setBrokers((cur) => cur.map((b) => (b.id === broker!.id ? { ...b, ...data } : b)));
          toast(t("br.toast.saved"));
        }
        onDone();
      },
    }));

    return (
      <>
        <div className="field">
          <label>{t("br.form.brokerName")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FXPro" />
        </div>
        <div className="field">
          <label>{t("br.form.logo")}</label>
          <div className="logo-upload">
            <div className="logo-preview">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded/pasted logo preview
                <img src={logo} alt="" />
              ) : (
                <span>{brokerInitials(name || "BK")}</span>
              )}
            </div>
            <div className="logo-upload-actions">
              <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
                <Icon name="upload" />
                {t("br.form.uploadImage")}
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={handleFile} />
              </label>
              <button
                type="button"
                className="logo-clear"
                onClick={() => {
                  setLogo("");
                  setLogoUrlInput("");
                }}
              >
                {t("br.form.remove")}
              </button>
            </div>
          </div>
        </div>
        <div className="field">
          <label>
            {t("br.form.pasteLogoUrl")} <span style={{ color: "var(--text-sub)" }}>{t("br.form.optional")}</span>
          </label>
          <input
            className="input"
            value={logoUrlInput}
            onChange={(e) => {
              setLogoUrlInput(e.target.value);
              setLogo(e.target.value.trim());
            }}
            placeholder="img/broker/…"
          />
        </div>
        <div className="field">
          <label>{t("br.partnerCode")}</label>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. BS-XXXX" />
        </div>
        <div className="field">
          <label>{t("br.openAccountLink")}</label>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>{t("br.form.lotImportMethod")}</label>
          <select className="input" value={importMethod} onChange={(e) => setImportMethod(e.target.value)}>
            <option value="CSV Import">CSV Import</option>
            <option value="API">API</option>
          </select>
        </div>
      </>
    );
  }
);

export default BrokerForm;
