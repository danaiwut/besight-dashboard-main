"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import AuthSocialButtons from "./AuthSocialButtons";
import BackgroundVideo from "../BackgroundVideo";
import AuthLanguageMenu from "./AuthLanguageMenu";
import PasswordToggleInput from "./PasswordToggleInput";
import { useLanguage } from "../crm/LanguageContext";
import { completeAuth } from "../../lib/auth";
import Icon from "../Icon";

const BG_VIDEO_SRC = "https://stream.mux.com/QgTir2Bu4u6d01CqyKEBCks68PIm2nCM7vhwXgenS00tw.m3u8";

export default function SignupView() {
  const { t } = useLanguage();
  const [emailError, setEmailError] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    if (!email) {
      setEmailError(true);
      emailRef.current?.focus();
      return;
    }
    setEmailError(false);
    const tradingview = (form.elements.namedItem("tradingview") as HTMLInputElement).value.trim();
    completeAuth({ email, tradingview });
  }

  return (
    <div className="auth-cinema">
      <BackgroundVideo className="auth-cinema-video" src={BG_VIDEO_SRC} />
      <div className="auth-cinema-overlay" />

      <Link className="auth-cinema-back" href="/">
        <Icon name="chevron_left" />
        {t("auth.signup.back")}
      </Link>

      <div className="auth-cinema-card auth-cinema-card-wide">
        <div className="auth-cinema-glass">
          <div className="auth-cinema-header">
            <div className="auth-cinema-brand">
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative lockup logo, sized by CSS */}
              <img src="/img/Horizontal-logo-w.png" alt="BeSight" />
              <h1>{t("auth.signup.title")}</h1>
            </div>
            <AuthLanguageMenu />
          </div>

          <div className="auth-cinema-body">
            <p>{t("auth.signup.subtitle")}</p>

            <AuthSocialButtons />

            <div className="auth-divider">{t("auth.signup.or")}</div>

            <form className="auth-form" noValidate onSubmit={handleSubmit}>
              <div className="auth-row">
                <div className="auth-field">
                  <label htmlFor="firstName">{t("auth.signup.firstName")}</label>
                  <input
                    className="auth-input"
                    type="text"
                    id="firstName"
                    name="firstName"
                    placeholder={t("auth.signup.firstNamePlaceholder")}
                    autoComplete="given-name"
                  />
                </div>
                <div className="auth-field">
                  <label htmlFor="lastName">{t("auth.signup.lastName")}</label>
                  <input
                    className="auth-input"
                    type="text"
                    id="lastName"
                    name="lastName"
                    placeholder={t("auth.signup.lastNamePlaceholder")}
                    autoComplete="family-name"
                  />
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor="email">
                  {t("auth.signup.email")} <span className="req-mark">*</span>
                </label>
                <input
                  className="auth-input"
                  type="email"
                  id="email"
                  name="email"
                  placeholder={t("auth.signup.emailPlaceholder")}
                  autoComplete="email"
                  required
                  aria-required="true"
                  ref={emailRef}
                  style={{ borderColor: emailError ? "#E0293E" : undefined }}
                  onChange={() => emailError && setEmailError(false)}
                />
              </div>

              <div className="auth-field">
                <label htmlFor="tradingview">
                  {t("auth.signup.tradingview")} <span className="opt-mark">{t("auth.signup.optional")}</span>
                </label>
                <input
                  className="auth-input"
                  type="text"
                  id="tradingview"
                  name="tradingview"
                  placeholder={t("auth.signup.tradingviewPlaceholder")}
                />
              </div>

              <div className="auth-field">
                <label htmlFor="address">
                  {t("auth.signup.address")} <span className="opt-mark">{t("auth.signup.optional")}</span>
                </label>
                <input
                  className="auth-input"
                  type="text"
                  id="address"
                  name="address"
                  placeholder={t("auth.signup.addressPlaceholder")}
                  autoComplete="street-address"
                />
              </div>

              <div className="auth-field">
                <label htmlFor="password">{t("auth.signup.password")}</label>
                <PasswordToggleInput
                  id="password"
                  name="password"
                  placeholder={t("auth.signup.passwordPlaceholder")}
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>
              <p className="auth-hint">{t("auth.signup.passwordHint")}</p>

              <button type="submit" className="auth-cinema-submit">
                {t("auth.signup.submit")}
              </button>
            </form>

            <p className="auth-cinema-alt">
              {t("auth.signup.haveAccount")} <Link href="/login">{t("auth.signup.logIn")}</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
