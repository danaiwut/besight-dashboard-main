"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../crm/LanguageContext";
import type { Lang } from "../../lib/i18n";
import Icon from "../Icon";

const OPTIONS: { code: Lang; label: string; abbr: string }[] = [
  { code: "en", label: "English", abbr: "EN" },
  { code: "th", label: "ไทย", abbr: "TH" },
];

export default function LanguageMenu() {
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
    <div className={`lang-menu${open ? " open" : ""}`} ref={ref}>
      <button
        type="button"
        className="lang-chip"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Language"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span className="lang-abbr">{current.abbr}</span>
        <Icon name="expand_more" className="chev" />
      </button>
      <div className="lang-dropdown" role="menu" aria-label="Language">
        {OPTIONS.map((o) => (
          <button
            key={o.code}
            type="button"
            className={`dd-item${o.code === lang ? " is-active" : ""}`}
            role="menuitemradio"
            aria-checked={o.code === lang}
            onClick={() => {
              setLang(o.code);
              setOpen(false);
            }}
          >
            <span className="lang-abbr">{o.abbr}</span>
            {o.label}
            {o.code === lang && <Icon name="check" className="dd-check" />}
          </button>
        ))}
      </div>
    </div>
  );
}
