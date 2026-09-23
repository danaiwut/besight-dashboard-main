"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../crm/LanguageContext";
import Icon from "../Icon";

/** Chromium's install event — not in the TS DOM lib yet. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "besight.installPrompt.dismissedAt";
/** After "not now", stay quiet for two weeks before asking again. */
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/** "Add BeSight to your home screen" banner, shown on phones/tablets only.
 *  Chrome/Edge/Android get a real Install button (beforeinstallprompt);
 *  iOS Safari has no install API, so it shows the Share → Add to Home
 *  Screen instruction instead. Hidden once installed or snoozed. */
export default function InstallPrompt() {
  const { t } = useLanguage();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;
    if (!window.matchMedia("(max-width: 1024px), (pointer: coarse)").matches) return;

    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    // Only Safari itself can add to the home screen on iOS.
    const isIosSafari = isIos && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
    // Let the page settle before the banner slides in.
    const iosTimer = isIosSafari
      ? window.setTimeout(() => {
          setIosHint(true);
          setHidden(false);
        }, 1500)
      : undefined;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.clearTimeout(iosTimer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* storage blocked — just hide for this visit */
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setHidden(true);
    else dismiss();
  }

  if (hidden || (!deferred && !iosHint)) return null;

  return (
    <div className="install-prompt" role="dialog" aria-label={t("pwa.install.title")}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static app icon */}
      <img src="/icons/icon-192.png" alt="" width={40} height={40} className="install-prompt-icon" />
      <div className="install-prompt-text">
        <strong>{t("pwa.install.title")}</strong>
        <span>{iosHint && !deferred ? t("pwa.install.iosHint") : t("pwa.install.body")}</span>
      </div>
      {deferred && (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void install()}>
          {t("pwa.install.cta")}
        </button>
      )}
      <button type="button" className="install-prompt-close" aria-label={t("pwa.install.dismiss")} onClick={dismiss}>
        <Icon name="close" />
      </button>
    </div>
  );
}
