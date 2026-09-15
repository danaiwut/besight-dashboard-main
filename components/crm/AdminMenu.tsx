"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLanguage } from "./LanguageContext";
import Icon from "../Icon";

export default function AdminMenu() {
  const { t } = useLanguage();
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

  return (
    <div className={`user-menu${open ? " open" : ""}`} ref={ref}>
      <button
        className="user-chip"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span className="avatar" style={{ width: 38, height: 38 }}>
          AD
        </span>
        <span className="utext">
          <span className="uname">Alex Dean</span>
          <br />
          <span className="uhandle">{t("nav.administrator")}</span>
        </span>
        <Icon name="expand_more" className="chev" />
      </button>
      <div className="user-dropdown" role="menu" aria-label="Account">
        <div className="user-dropdown-head">
          <span className="avatar" style={{ width: 38, height: 38 }}>
            AD
          </span>
          <span style={{ lineHeight: 1.2 }}>
            <span className="dd-name">Alex Dean</span>
            <br />
            <span className="dd-mail">alex.dean@besight.com</span>
          </span>
        </div>
        <Link className="dd-item" role="menuitem" href="/crm/settings" onClick={() => setOpen(false)}>
          <Icon name="person" />
          {t("menu.myProfile")}
        </Link>
        <Link className="dd-item" role="menuitem" href="/crm/settings" onClick={() => setOpen(false)}>
          <Icon name="settings" />
          {t("nav.settings")}
        </Link>
        <div className="dd-divider"></div>
        <Link className="dd-item danger" role="menuitem" href="/">
          <Icon name="logout" />
          {t("nav.logOut")}
        </Link>
      </div>
    </div>
  );
}
