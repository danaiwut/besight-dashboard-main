"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../crm/LanguageContext";
import { apiCall } from "../../lib/crmApi";
import Icon from "../Icon";

type Policy = { text: string; version: number };

/** Shown before an EA download: the member must read the admin-set EA policy
 *  and tick the acceptance box. Only then does the server log the acceptance
 *  and hand back the download link, which opens in a new tab. */
export default function EaPolicyModal({
  indicator,
  onClose,
}: {
  indicator: { id: number; name: string } | null;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loadError, setLoadError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadPolicy() {
    setPolicy(null);
    setLoadError("");
    try {
      const payload = await apiCall<{ policy: Policy }>("/api/me/ea-download/", "GET");
      setPolicy(payload.policy);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("dash.ea.loadFailed"));
    }
  }

  useEffect(() => {
    if (!indicator) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset + fetch each time the dialog opens
    setAccepted(false);
    setError("");
    void loadPolicy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicator?.id]);

  if (!indicator) return null;

  async function confirm() {
    if (!indicator || !policy || !accepted || busy) return;
    // Open the tab synchronously (inside the click) so popup blockers allow
    // it, then point it at the link once the server releases it.
    const tab = window.open("about:blank", "_blank");
    setBusy(true);
    setError("");
    try {
      const payload = await apiCall<{ url: string }>("/api/me/ea-download/", "POST", {
        indicatorId: indicator.id,
        policyVersion: policy.version,
        accepted: true,
      });
      if (tab) {
        tab.opener = null;
        tab.location.href = payload.url;
      } else {
        window.location.href = payload.url;
      }
      onClose();
    } catch (e) {
      tab?.close();
      const message = e instanceof Error ? e.message : t("dash.ea.downloadFailed");
      setError(message);
      // Wording changed while the dialog was open — reload it and re-ask.
      if (/updated|review it again/i.test(message)) {
        setAccepted(false);
        void loadPolicy();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="modal-scrim show" onClick={onClose}></div>
      <div className="modal show ea-policy-modal" role="dialog" aria-modal="true" aria-labelledby="ea-policy-title">
        <div className="modal-icon pending">
          <Icon name="gavel" />
        </div>
        <h3 className="modal-title" id="ea-policy-title">{t("dash.ea.policyTitle")}</h3>
        <p className="modal-detail" style={{ marginBottom: 12 }}>{t("dash.ea.policyIntro", { name: indicator.name })}</p>
        <div className="ea-policy-text" tabIndex={0}>
          {policy ? policy.text : loadError || "…"}
        </div>
        {loadError && (
          <button className="btn btn-ghost" style={{ marginBottom: 12 }} onClick={() => void loadPolicy()}>
            {t("common.retry")}
          </button>
        )}
        <label className="ea-policy-accept">
          <input type="checkbox" checked={accepted} disabled={!policy} onChange={(e) => setAccepted(e.target.checked)} />
          <span>{t("dash.ea.acceptLabel")}</span>
        </label>
        {error && <div className="ea-policy-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" onClick={() => void confirm()} disabled={!policy || !accepted || busy}>
            <Icon name="download" />
            {busy ? "…" : t("dash.ea.acceptAndDownload")}
          </button>
        </div>
      </div>
    </>
  );
}
