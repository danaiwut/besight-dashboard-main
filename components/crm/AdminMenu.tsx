"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLanguage } from "./LanguageContext";
import { useCrm, initials } from "./CrmContext";
import Icon from "../Icon";

export default function AdminMenu() {
  const { t } = useLanguage();
  const { viewer } = useCrm();
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
          {initials(viewer.name || viewer.email || "AD")}
        </span>
        <span className="utext">
          <span className="uname">{viewer.name || viewer.email}</span>
          <br />
          <span className="uhandle">{t("nav.administrator")}</span>
        </span>
        <Icon name="expand_more" className="chev" />
      </button>
      <div className="user-dropdown" role="menu" aria-label="Account">
        <div className="user-dropdown-head">
          <span className="avatar" style={{ width: 38, height: 38 }}>
            {initials(viewer.name || viewer.email || "AD")}
          </span>
          <span style={{ lineHeight: 1.2 }}>
            <span className="dd-name">{viewer.name || viewer.email}</span>
            <br />
            <span className="dd-mail">{viewer.email}</span>
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
        <button
          type="button"
          className="dd-item danger"
          role="menuitem"
          onClick={async () => {
            setOpen(false);
            const { signOut } = await import("next-auth/react");
            await signOut({ callbackUrl: "/login" });
          }}
        >
          <Icon name="logout" />
          {t("nav.logOut")}
        </button>
      </div>
    </div>
  );
}
