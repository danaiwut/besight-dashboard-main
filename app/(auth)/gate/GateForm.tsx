"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import BackgroundVideo from "../../../components/BackgroundVideo";
import AuthLanguageMenu from "../../../components/auth/AuthLanguageMenu";
import PasswordToggleInput from "../../../components/auth/PasswordToggleInput";
import { useLanguage } from "../../../components/crm/LanguageContext";
import Icon from "../../../components/Icon";

const BG_VIDEO_SRC = "https://stream.mux.com/QgTir2Bu4u6d01CqyKEBCks68PIm2nCM7vhwXgenS00tw.m3u8";

/* Credentials-only re-login. On success the browser goes back to the page
   that sent the user here (?next=), so an expired admin session resumes
   exactly where it left off. */
export default function GateForm({ next }: { next: string }) {
  const { t } = useLanguage();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    const result = await signIn("credentials", { email, password, redirect: false });
    if (!result || result.error) {
      setError(t("auth.login.invalid"));
      setBusy(false);
      return;
    }
    window.location.href = next;
  }

  return (
    <div className="auth-cinema">
      <BackgroundVideo className="auth-cinema-video" src={BG_VIDEO_SRC} />
      <div className="auth-cinema-overlay" />

      <Link className="auth-cinema-back" href="/login">
        <Icon name="chevron_left" />
        {t("auth.login.back")}
      </Link>

      <div className="auth-cinema-card">
        <div className="auth-cinema-glass">
          <div className="auth-cinema-header">
            <div className="auth-cinema-brand">
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative lockup logo, sized by CSS */}
              <img src="/img/Horizontal-logo-w.png" alt="BeSight" />
              <h1>{t("auth.gate.title")}</h1>
            </div>
            <AuthLanguageMenu />
          </div>

          <div className="auth-cinema-body">
            <p>{t("auth.gate.subtitle")}</p>

            <form className="auth-form" noValidate onSubmit={handleSubmit}>
              <div className="auth-field">
                <label htmlFor="email">{t("auth.login.email")}</label>
                <input
                  className="auth-input"
                  type="email"
                  id="email"
                  name="email"
                  placeholder={t("auth.login.emailPlaceholder")}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="password">{t("auth.login.password")}</label>
                <PasswordToggleInput id="password" name="password" placeholder={t("auth.login.passwordPlaceholder")} autoComplete="current-password" />
              </div>

              {error && <p className="auth-error" role="alert">{error}</p>}

              <button type="submit" className="auth-cinema-submit" disabled={busy}>
                {busy ? t("auth.login.submitting") : t("auth.login.submit")}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
