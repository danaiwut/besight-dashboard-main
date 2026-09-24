"use client";

import { useState } from "react";
import { useCrm } from "../crm/CrmContext";
import { useLanguage } from "../crm/LanguageContext";
import Icon from "../Icon";

/** Member proves they are the person the CRM has on file: the TradingView
 *  username they enter is checked against the synced Member record, and the
 *  email is the one they signed in with (checked server-side, not typed).
 *  Only after this can a trade account be claimed. */
export default function IdentityVerifyCard() {
  const { t } = useLanguage();
  const { identity, verifyIdentity, viewer } = useCrm();
  const [tradingView, setTradingView] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    const result = await verifyIdentity(tradingView.trim());
    if (!result.ok) setError(result.error || t("dash.identity.failed"));
    setBusy(false);
  }

  if (identity) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 0", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-card2, rgba(0,0,0,0.03))" }}>
        <Icon name="verified_user" style={{ color: "var(--green, #1fa25a)", fontSize: 18 }} />
        <span style={{ fontSize: 12.5 }}>{t("dash.identity.verified", { tradingView: identity.tradingView })}</span>
      </div>
    );
  }

  return (
    <div style={{ margin: "14px 0 0", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-card2, rgba(0,0,0,0.03))" }}>
      <div className="panel-section-title" style={{ marginBottom: 4 }}>{t("dash.identity.title")}</div>
      <p style={{ fontSize: 12.5, color: "var(--text-sub)", marginBottom: 10 }}>{t("dash.identity.hint")}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="input"
          style={{ flex: "1 1 180px", minWidth: 0 }}
          placeholder={t("dash.identity.tradingView")}
          aria-label={t("dash.identity.tradingView")}
          value={tradingView}
          disabled={busy}
          onChange={(e) => setTradingView(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && tradingView.trim() && !busy) void submit();
          }}
        />
        <button
          className="btn btn-primary"
          disabled={busy || !tradingView.trim()}
          onClick={() => void submit()}
        >
          {t("dash.identity.confirm")}
        </button>
      </div>
      {viewer.email && (
        <p style={{ fontSize: 12, color: "var(--text-sub)", marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t("dash.identity.usingEmail", { email: viewer.email })}
        </p>
      )}
      {error && <p role="alert" style={{ color: "var(--red, #d9534f)", fontSize: 12.5, marginTop: 8 }}>{error}</p>}
    </div>
  );
}
