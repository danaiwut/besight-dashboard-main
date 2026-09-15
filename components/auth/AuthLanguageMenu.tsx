"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../crm/LanguageContext";
import type { Lang } from "../../lib/i18n";
import Icon from "../Icon";

// Listed as a dropdown (rather than a two-way toggle) specifically so more
// languages can be added here later without changing the interaction.
const OPTIONS: { code: Lang; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "th", label: "ไทย", flag: "🇹🇭" },
];

export default function AuthLanguageMenu() {
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const current = OPTIONS.find((o) => o.code === lang) ?? OPTIONS[0];

  return (
    <div className={`auth-cinema-lang-menu${open ? " open" : ""}`} ref={ref}>
      <button
        type="button"
        className="auth-cinema-lang"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Language"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span className="auth-cinema-lang-flag" aria-hidden="true">
          <span>{current.flag}</span>
        </span>
        {current.code.toUpperCase()}
        <Icon name="expand_more" className="auth-cinema-lang-chev" />
      </button>
      <div className="auth-cinema-lang-dropdown" role="menu" aria-label="Language">
        {OPTIONS.map((o) => (
          <button
            key={o.code}
            type="button"
            className={`auth-cinema-lang-item${o.code === lang ? " is-active" : ""}`}
            role="menuitemradio"
            aria-checked={o.code === lang}
            onClick={() => {
              setLang(o.code);
              setOpen(false);
            }}
          >
            <span className="auth-cinema-lang-flag" aria-hidden="true">
              <span>{o.flag}</span>
            </span>
            {o.label}
            {o.code === lang && <Icon name="check" className="auth-cinema-lang-check" />}
          </button>
        ))}
      </div>
    </div>
  );
}
