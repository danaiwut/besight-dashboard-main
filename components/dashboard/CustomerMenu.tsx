"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLanguage } from "../crm/LanguageContext";
import { displayNameOf } from "../crm/CrmContext";
import { useCustomerData } from "./useCustomerData";
import Avatar from "../Avatar";
import Icon from "../Icon";

export default function CustomerMenu() {
  const { t } = useLanguage();
  const { member } = useCustomerData();
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
        <Avatar member={member} size={38} />
        <span className="utext">
          <span className="uname">{displayNameOf(member)}</span>
          <br />
          <span className="uhandle">{member.email}</span>
        </span>
        <Icon name="expand_more" className="chev" />
      </button>
      <div className="user-dropdown" role="menu" aria-label="Account">
        <div className="user-dropdown-head">
          <Avatar member={member} size={38} />
          <span style={{ lineHeight: 1.2 }}>
            <span className="dd-name">{displayNameOf(member)}</span>
            <br />
            <span className="dd-mail">{member.email}</span>
          </span>
        </div>
        <Link className="dd-item" role="menuitem" href="/dashboard/profile" onClick={() => setOpen(false)}>
          <Icon name="person" />
          {t("dash.nav.profile")}
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
