"use client";

import Link from "next/link";
import AuthSocialButtons from "./AuthSocialButtons";
import BackgroundVideo from "../BackgroundVideo";
import AuthLanguageMenu from "./AuthLanguageMenu";
import PasswordToggleInput from "./PasswordToggleInput";
import { useLanguage } from "../crm/LanguageContext";
import { completeAuth } from "../../lib/auth";
import Icon from "../Icon";

const BG_VIDEO_SRC = "https://stream.mux.com/QgTir2Bu4u6d01CqyKEBCks68PIm2nCM7vhwXgenS00tw.m3u8";

export default function LoginView() {
  const { t } = useLanguage();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    completeAuth({ email });
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
              <h1>{t("auth.login.title")}</h1>
            </div>
            <AuthLanguageMenu />
          </div>

          <div className="auth-cinema-body">
            <p>{t("auth.login.subtitle")}</p>

            <AuthSocialButtons />

            <div className="auth-divider">{t("auth.login.or")}</div>

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
                />
              </div>

              <div className="auth-field">
                <label htmlFor="password">{t("auth.login.password")}</label>
                <PasswordToggleInput id="password" name="password" placeholder={t("auth.login.passwordPlaceholder")} autoComplete="current-password" />
              </div>

              <div className="auth-inline">
                <label className="auth-check">
                  <input type="checkbox" name="remember" /> {t("auth.login.remember")}
                </label>
                <a className="auth-link" href="#">
                  {t("auth.login.forgot")}
                </a>
              </div>

              <button type="submit" className="auth-cinema-submit">
                {t("auth.login.submit")}
              </button>
            </form>

            <p className="auth-cinema-alt">
              {t("auth.login.noAccount")} <Link href="/signup">{t("auth.login.signUp")}</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
