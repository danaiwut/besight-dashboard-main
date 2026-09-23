"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useLanguage } from "./LanguageContext";
import Icon from "../Icon";

/* Second CRM password layer: shown by app/crm/layout.tsx after an admin
   has signed in but hasn't unlocked the shared gate yet. Unlocking sets an
   httpOnly cookie, so a full reload re-renders behind the open gate. */
export default function CrmGateForm({ name }: { name: string }) {
  const { t } = useLanguage();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const form = e.currentTarget;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    try {
      const response = await fetch("/api/crm/gate/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError(t("crm.gate.invalid"));
        setBusy(false);
        return;
      }
      window.location.reload();
    } catch {
      setError(t("crm.gate.invalid"));
      setBusy(false);
    }
  }

  return (
    <div className="gate-wrap">
      <div className="gate-card card">
        <div className="gate-icon">
          <Icon name="lock" />
        </div>
        <h1>{t("crm.gate.title")}</h1>
        <p className="gate-sub">{t("crm.gate.subtitle", { name })}</p>
        <form noValidate onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="gate-password">{t("crm.gate.password")}</label>
            <input
              className="input"
              type="password"
              id="gate-password"
              name="password"
              placeholder={t("crm.gate.placeholder")}
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p className="gate-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary gate-submit" disabled={busy}>
            {busy ? t("crm.gate.submitting") : t("crm.gate.submit")}
          </button>
        </form>
        <button type="button" className="btn btn-ghost gate-submit" onClick={() => void signOut({ callbackUrl: "/login" })}>
          {t("crm.gate.signOut")}
        </button>
      </div>
    </div>
  );
}
