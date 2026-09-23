"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import BackgroundVideo from "../BackgroundVideo";
import AuthLanguageMenu from "./AuthLanguageMenu";
import PasswordToggleInput from "./PasswordToggleInput";
import { useLanguage } from "../crm/LanguageContext";
import Icon from "../Icon";

const BG_VIDEO_SRC = "https://stream.mux.com/QgTir2Bu4u6d01CqyKEBCks68PIm2nCM7vhwXgenS00tw.m3u8";

export default function RegisterView() {
  const { t } = useLanguage();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem("confirmPassword") as HTMLInputElement).value;

    if (password !== confirmPassword) {
      setError(t("auth.register.error.mismatch"));
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/register/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; code?: string };

      if (!response.ok || !payload.ok) {
        setError(
          payload.code === "email_taken" ? t("auth.register.error.emailTaken") : t("auth.register.error.invalid"),
        );
        setBusy(false);
        return;
      }

      const result = await signIn("credentials", { email, password, redirect: false });
      if (!result || result.error) {
        // Account exists but the auto sign-in hiccuped — send them to log in by hand.
        window.location.href = "/login/";
        return;
      }
      // Full reload so every provider re-reads behind the new session; "/"
      // sends a brand-new member straight to /dashboard.
      window.location.href = "/";
    } catch {
      setError(t("auth.register.error.generic"));
      setBusy(false);
    }
  }

  return (
    <div className="auth-cinema">
      <BackgroundVideo className="auth-cinema-video" src={BG_VIDEO_SRC} />
      <div className="auth-cinema-overlay" />

      <Link className="auth-cinema-back" href="/">
        <Icon name="chevron_left" />
        {t("auth.login.back")}
      </Link>

      <div className="auth-cinema-card">
        <div className="auth-cinema-glass">
          <div className="auth-cinema-header">
            <div className="auth-cinema-brand">
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative lockup logo, sized by CSS */}
              <img src="/img/Horizontal-logo-w.png" alt="BeSight" />
              <h1>{t("auth.register.title")}</h1>
            </div>
            <AuthLanguageMenu />
          </div>

          <div className="auth-cinema-body">
            <p>{t("auth.register.subtitle")}</p>

            <form className="auth-form" noValidate onSubmit={handleSubmit}>
              <div className="auth-field">
                <label htmlFor="name">{t("auth.register.name")}</label>
                <input
                  className="auth-input"
                  type="text"
                  id="name"
                  name="name"
                  placeholder={t("auth.register.namePlaceholder")}
                  autoComplete="name"
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="email">{t("auth.register.email")}</label>
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
                <label htmlFor="password">{t("auth.register.password")}</label>
                <PasswordToggleInput
                  id="password"
                  name="password"
                  placeholder={t("auth.register.passwordPlaceholder")}
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>

              <div className="auth-field">
                <label htmlFor="confirmPassword">{t("auth.register.confirmPassword")}</label>
                <PasswordToggleInput
                  id="confirmPassword"
                  name="confirmPassword"
                  placeholder={t("auth.register.confirmPasswordPlaceholder")}
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>

              {error && <p className="auth-error" role="alert">{error}</p>}

              <button type="submit" className="auth-cinema-submit" disabled={busy}>
                {busy ? t("auth.register.submitting") : t("auth.register.submit")}
              </button>
            </form>

            <p className="auth-alt">
              {t("auth.register.haveAccount")}{" "}
              <Link href="/login/">{t("auth.register.logIn")}</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
