"use client";

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCrm, initials } from "./CrmContext";
import { signOut } from "next-auth/react";
import DataUnavailable from "./DataUnavailable";
import { useLanguage } from "./LanguageContext";
import CrmNotifications from "./CrmNotifications";
import AdminMenu from "./AdminMenu";
import Icon from "../Icon";

const TITLE_KEYS: Record<string, [string, string]> = {
  "/crm": ["title.overview", "sub.overview"],
  "/crm/members": ["title.members", "sub.members"],
  "/crm/members/detail": ["title.memberDetail", "sub.memberDetail"],
  "/crm/campaigns": ["title.campaigns", "sub.campaigns"],
  "/crm/activities": ["title.activities", "sub.activities"],
  "/crm/spin": ["title.spin", "sub.spin"],
  "/crm/reward-tiers": ["title.rewardTiers", "sub.rewardTiers"],
  "/crm/leaderboard-avatars": ["title.leaderboardAvatars", "sub.leaderboardAvatars"],
  "/crm/reward-claims": ["title.rewardClaims", "sub.rewardClaims"],
  "/crm/courses": ["title.courses", "sub.courses"],
  "/crm/indicators": ["title.indicators", "sub.indicators"],
  "/crm/brokers": ["title.brokers", "sub.brokers"],
  "/crm/telegram-access": ["title.telegramAccess", "sub.telegramAccess"],
  "/crm/activity-logs": ["title.activityLogs", "sub.activityLogs"],
  "/crm/settings": ["title.settings", "sub.settings"],
};

const NAV_ITEMS = [
  {
    href: "/crm",
    labelKey: "nav.overview",
    icon: <Icon name="dashboard" />,
  },
  {
    href: "/crm/members",
    labelKey: "nav.members",
    icon: <Icon name="group" />,
    hasCount: true,
  },
  {
    href: "/crm/campaigns",
    labelKey: "nav.campaigns",
    icon: <Icon name="campaign" />,
  },
  {
    href: "/crm/activities",
    labelKey: "nav.activities",
    icon: <Icon name="emoji_events" />,
  },
  {
    href: "/crm/spin",
    labelKey: "nav.spin",
    icon: <Icon name="casino" />,
  },
  {
    href: "/crm/reward-tiers",
    labelKey: "nav.rewardTiers",
    icon: <Icon name="military_tech" />,
  },
  {
    href: "/crm/leaderboard-avatars",
    labelKey: "nav.leaderboardAvatars",
    icon: <Icon name="face" />,
  },
  {
    href: "/crm/reward-claims",
    labelKey: "nav.rewardClaims",
    icon: <Icon name="card_giftcard" />,
  },
  {
    href: "/crm/courses",
    labelKey: "nav.courses",
    icon: <Icon name="school" />,
  },
  {
    href: "/crm/brokers",
    labelKey: "nav.brokers",
    dividerBefore: true,
    icon: <Icon name="work" />,
  },
  {
    href: "/crm/telegram-access",
    labelKey: "nav.telegramAccess",
    icon: <Icon name="send" />,
  },
  {
    href: "/crm/activity-logs",
    labelKey: "nav.activityLogs",
    icon: <Icon name="history" />,
  },
  {
    href: "/crm/indicators",
    labelKey: "nav.indicators",
    icon: <Icon name="insights" />,
  },
  {
    href: "/crm/settings",
    labelKey: "nav.settings",
    icon: <Icon name="settings" />,
  },
];

function CrmChromeInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { members, viewer } = useCrm();
  const { t } = useLanguage();
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const titleKeys = TITLE_KEYS[normalizedPath] ?? [null, null];

  function closeSidebar() {
    setSidebarOpen(false);
  }

  return (
    <div className="crm">
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`} id="sidebar">
        <div className="sidebar-head">
          <Link className="sidebar-brand" href="/" aria-label="BeSight home">
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative lockup logo, height set by CSS */}
            <img src="/img/Horizontal-logo-c.png" alt="BeSight" />
          </Link>
          <button className="sidebar-close" aria-label={t("common.close")} onClick={closeSidebar}>
            <Icon name="close" />
          </button>
        </div>
        <div className="sidebar-label">{t("nav.management")}</div>
        <nav className="sidebar-nav" aria-label="Admin navigation">
          {NAV_ITEMS.map((item) => (
            <Fragment key={item.href}>
              {item.dividerBefore && <hr className="nav-divider" />}
              <Link
                className={`nav-item${normalizedPath === item.href ? " is-active" : ""}`}
                href={item.href}
                onClick={closeSidebar}
              >
                {item.icon}
                {t(item.labelKey)}
                {item.hasCount && <span className="count">{members.length}</span>}
              </Link>
            </Fragment>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="admin-chip">
            <span className="avatar">{initials(viewer.name || viewer.email || "AD")}</span>
            <span style={{ lineHeight: 1.2 }}>
              <span className="an">{viewer.name || viewer.email}</span>
              <br />
              <span className="ar">{t("nav.administrator")}</span>
            </span>
          </div>
          <button type="button" className="logout-link" onClick={() => void signOut({ callbackUrl: "/login" })}>
            <Icon name="logout" />
            {t("nav.logOut")}
          </button>
        </div>
      </aside>
      <div className={`scrim side${sidebarOpen ? " show" : ""}`} onClick={closeSidebar}></div>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="menu-toggle" aria-label="Open menu" onClick={() => setSidebarOpen((v) => !v)}>
              <Icon name="menu" />
            </button>
            <div>
              <h1>{titleKeys[0] ? t(titleKeys[0]) : "CRM"}</h1>
              <div className="sub">{titleKeys[1] ? t(titleKeys[1]) : ""}</div>
            </div>
          </div>
          <div className="topbar-right">
            <CrmNotifications />
            <AdminMenu />
          </div>
        </header>

        <DataUnavailable />
        {children}
      </main>
    </div>
  );
}

function CrmToast() {
  const { toastMsg, toastShow } = useCrm();
  return <div className={`toast${toastShow ? " show" : ""}`}>{toastMsg}</div>;
}

export default function CrmChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <CrmChromeInner>{children}</CrmChromeInner>
      <CrmToast />
    </>
  );
}
