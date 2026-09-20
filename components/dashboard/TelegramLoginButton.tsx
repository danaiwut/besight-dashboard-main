"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../crm/LanguageContext";
import { apiCall } from "../../lib/crmApi";

type TelegramWidgetUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

declare global {
  interface Window {
    onTelegramSocialAuth?: (user: TelegramWidgetUser) => void;
  }
}

/** Telegram Login Widget button. On mobile this deep-links into the Telegram
 *  app for confirmation; the signed user object is verified server-side
 *  (HMAC) before linking — never trusted from the client alone. */
export default function TelegramLoginButton({
  botUsername,
  onLinked,
}: {
  botUsername: string;
  onLinked: (username: string | null) => void;
}) {
  const { t } = useLanguage();
  const hostRef = useRef<HTMLSpanElement>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const callbackRef = useRef(onLinked);

  useEffect(() => {
    callbackRef.current = onLinked;
  }, [onLinked]);

  useEffect(() => {
    window.onTelegramSocialAuth = (user: TelegramWidgetUser) => {
      if (busy) return;
      setBusy(true);
      apiCall<{ username?: string | null }>("/api/me/social/telegram/", "POST", user)
        .then((payload) => callbackRef.current(payload.username ?? user.username ?? null))
        .catch(() => setFailed(true))
        .finally(() => setBusy(false));
    };
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onTelegramSocialAuth(user)");
    script.onerror = () => setFailed(true);
    hostRef.current?.appendChild(script);
    return () => {
      delete window.onTelegramSocialAuth;
      script.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botUsername]);

  if (failed) return <span style={{ fontSize: 12.5, color: "var(--red)" }}>{t("dash.vip.telegram.widgetFailed")}</span>;
  if (busy) return <span style={{ fontSize: 12.5, color: "var(--text-sub)" }}>…</span>;
  // The widget replaces this host with its own login button.
  return <span ref={hostRef} style={{ display: "inline-block", minHeight: 40, minWidth: 200 }} />;
}
