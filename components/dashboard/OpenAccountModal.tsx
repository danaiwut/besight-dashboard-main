"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { useCrm } from "../crm/CrmContext";
import { useLanguage } from "../crm/LanguageContext";
import Icon from "../Icon";

export default function OpenAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLanguage();
  const { brokers } = useCrm();
  const broker = brokers.find((b) => b.name === "XM");
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // createPortal needs a real document.body, which only exists client-side —
    // this mount-flag effect is the standard SSR-safe portal pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted || !open) return null;

  function copyCode() {
    if (!broker) return;
    navigator.clipboard
      ?.writeText(broker.code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  return createPortal(
    <>
      <div className="modal-scrim show" onClick={onClose}></div>
      <div className="modal show" role="dialog" aria-modal="true">
        <h3 className="modal-title">{t("dash.openAccount.title")}</h3>
        <p className="modal-detail">{t("dash.openAccount.detail")}</p>

        <div className="open-account-code">
          <span className="mono">{broker?.code}</span>
          <button type="button" className="btn btn-ghost" onClick={copyCode}>
            <Icon name={copied ? "check" : "content_copy"} />
            {copied ? t("dash.openAccount.copied") : t("dash.openAccount.copy")}
          </button>
        </div>

        <div className="modal-actions">
          <a className="btn btn-primary" href={broker?.url} target="_blank" rel="noopener noreferrer" onClick={onClose}>
            {t("dash.openAccount.goToSignup")}
            <Icon name="arrow_forward" />
          </a>
        </div>
      </div>
    </>,
    document.body
  );
}
