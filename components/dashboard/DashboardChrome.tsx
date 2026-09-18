"use client";

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCrm, displayNameOf } from "../crm/CrmContext";
import { useLanguage } from "../crm/LanguageContext";
import { useCustomerData } from "./useCustomerData";
import { useTheme } from "./ThemeContext";
import CustomerMenu from "./CustomerMenu";
import CustomerNotifications from "./CustomerNotifications";
import LanguageMenu from "./LanguageMenu";
import Avatar from "../Avatar";
import Icon from "../Icon";

const NAV_GROUPS = [
  {
    labelKey: "dash.nav.groupMain",
    items: [
      { href: "/dashboard", icon: "grid_view", labelKey: "dash.nav.overview" },
      { href: "/dashboard/indicators", icon: "donut_large", labelKey: "dash.nav.indicators" },
      {
        href: "/dashboard/rewards",
        icon: "redeem",
        labelKey: "dash.nav.rewards",
        children: [
          { href: "/dashboard/activities", labelKey: "dash.nav.activities" },
          { href: "/dashboard/spin-wheel", labelKey: "dash.nav.spinWheel" },
          { href: "/dashboard/bec-rates", labelKey: "dash.nav.becRates" },
          { href: "/dashboard/rewards", labelKey: "dash.nav.rewardsPrograms" },
        ],
      },
      { href: "/dashboard/leaderboard", icon: "bar_chart", labelKey: "dash.nav.leaderboard" },
      { href: "/dashboard/courses", icon: "smart_display", labelKey: "dash.nav.course" },
      { href: "/dashboard/journal", icon: "menu_book", labelKey: "dash.nav.journal" },
    ],
  },
  {
    labelKey: "dash.nav.groupAccount",
    items: [
      { href: "/dashboard/vip", icon: "workspace_premium", labelKey: "dash.nav.vip" },
      { href: "/dashboard/profile", icon: "person", labelKey: "dash.nav.profile" },
      { href: "/dashboard/settings", icon: "settings", labelKey: "dash.nav.settings" },
    ],
  },
];

const TITLE_KEYS: Record<string, [string, string | null]> = {
  "/dashboard": ["dash.title.overview", null],
  "/dashboard/indicators": ["dash.title.indicators", "dash.sub.indicators"],
  "/dashboard/rewards": ["dash.title.rewards", "dash.sub.rewards"],
  "/dashboard/activities": ["dash.title.activities", "dash.sub.activities"],
  "/dashboard/spin-wheel": ["dash.title.spinWheel", "dash.sub.spinWheel"],
  "/dashboard/bec-rates": ["dash.title.becRates", "dash.sub.becRates"],
  "/dashboard/leaderboard": ["dash.title.leaderboard", "dash.sub.leaderboard"],
  "/dashboard/courses": ["dash.title.courses", "dash.sub.courses"],
  "/dashboard/journal": ["dash.title.journal", "dash.sub.journal"],
  "/dashboard/vip": ["dash.title.vip", "dash.sub.vip"],
  "/dashboard/profile": ["dash.title.profile", "dash.sub.profile"],
  "/dashboard/settings": ["dash.title.settings", "dash.sub.settings"],
};

const TICKER_REPEATS = 4;

export default function DashboardChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const { theme, setTheme, lightBgUrl, darkBgUrl } = useTheme();
  const { toast } = useCrm();
  const { member } = useCustomerData();
  const [navOpen, setNavOpen] = useState(false);
  const [search, setSearch] = useState("");
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const [titleKey, subKey] = TITLE_KEYS[normalizedPath] ?? TITLE_KEYS["/dashboard"];
  const isOverview = normalizedPath === "/dashboard";
  const openByDefault = new Set(
    NAV_GROUPS.flatMap((group) => group.items)
      .filter((item) => item.children?.some((c) => c.href === normalizedPath))
      .map((item) => item.href),
  );
  const [openGroups, setOpenGroups] = useState(openByDefault);

  function closeNav() {
    setNavOpen(false);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    toast(t("dash.topbar.searchToast", { query: q }));
  }

  function toggleGroup(href: string) {
    setOpenGroups((cur) => {
      const next = new Set(cur);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  return (
    <div
      className="dashx-shell"
      data-theme={theme}
      style={theme === "light" && lightBgUrl ? { backgroundImage: `url("${lightBgUrl}")` } : undefined}
    >
      {theme === "dark" && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed decorative background, not a content image */}
          <img className="dashx-bg-image" src={darkBgUrl ?? "/img/dashboard-black-bg.jpg"} alt="" aria-hidden="true" />
          <div className="dashx-bg-overlay" aria-hidden="true" />
        </>
      )}
      {/* Below the 860px breakpoint (same as the admin CRM's own sidebar)
          this becomes an off-canvas drawer — hidden by default, slid in
          via .open — instead of shrinking to an icon-only rail, matching
          how .sidebar behaves in crm.css. */}
      <aside className={`icon-rail${navOpen ? " open" : ""}`} aria-label="Dashboard navigation">
        <div className="rail-logo-row">
          <Link href="/dashboard" className="rail-logo" aria-label="BeSight home" onClick={closeNav}>
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative logo, sized by CSS */}
            <img src={theme === "dark" ? "/img/Horizontal-logo-w.png" : "/img/Horizontal-logo-c.png"} alt="BeSight" />
          </Link>
          <button className="sidebar-close" aria-label={t("common.close")} onClick={closeNav}>
            <Icon name="close" />
          </button>
        </div>
        {NAV_GROUPS.map((group) => (
          <Fragment key={group.labelKey}>
            <div className="sidebar-label">{t(group.labelKey)}</div>
            <nav className="sidebar-nav" aria-label={t(group.labelKey)}>
              {group.items.map((item) => {
                if (item.children) {
                  const children = item.children;
                  const open = openGroups.has(item.href);
                  const childActive = children.some((c) => c.href === normalizedPath);
                  return (
                    <div key={item.href} className="nav-group">
                      <button
                        type="button"
                        className={`nav-item has-children${childActive ? " is-active" : ""}`}
                        title={t(item.labelKey)}
                        aria-expanded={open}
                        onClick={() => toggleGroup(item.href)}
                      >
                        <Icon name={item.icon} />
                        <span className="nav-label">{t(item.labelKey)}</span>
                        <Icon name="expand_more" className="nav-chev" />
                      </button>
                      {open && (
                        <div className="nav-children">
                          {children.map((child) => {
                            const active = normalizedPath === child.href;
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                className={`nav-subitem${active ? " is-active" : ""}`}
                                aria-current={active ? "page" : undefined}
                                onClick={closeNav}
                              >
                                <span className="nav-label">{t(child.labelKey)}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }
                const active = normalizedPath === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item${active ? " is-active" : ""}`}
                    title={t(item.labelKey)}
                    aria-current={active ? "page" : undefined}
                    onClick={closeNav}
                  >
                    <Icon name={item.icon} />
                    <span className="nav-label">{t(item.labelKey)}</span>
                  </Link>
                );
              })}
            </nav>
          </Fragment>
        ))}
        <div className="rail-foot">
          {/* Profile summary + language switcher — only shown here below
              the mobile breakpoint (dashboard.css hides this on desktop,
              where the topbar's own copies already cover them), so the
              nav drawer carries everything needed on a phone in one place. */}
          <Link href="/dashboard/profile" className="rail-account" onClick={closeNav}>
            <Avatar member={member} size={34} />
            <span className="rail-account-info">
              <span className="rail-account-name">{displayNameOf(member)}</span>
              <span className="rail-account-email">{member.email}</span>
            </span>
          </Link>
          <LanguageMenu />
          <button
            type="button"
            className="theme-switch"
            role="switch"
            aria-checked={theme === "dark"}
            aria-label={t("dash.theme.group")}
            title={theme === "dark" ? t("dash.theme.light") : t("dash.theme.dark")}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Icon name="light_mode" className="theme-switch-icon sun" />
            <Icon name="dark_mode" className="theme-switch-icon moon" />
            <span className="theme-switch-knob">
              <Icon name={theme === "dark" ? "dark_mode" : "light_mode"} />
            </span>
          </button>
          <button
            type="button"
            className="logout-link"
            title={t("nav.logOut")}
            onClick={() => {
              closeNav();
              void signOut({ callbackUrl: "/login" });
            }}
          >
            <Icon name="logout" />
            <span className="nav-label">{t("nav.logOut")}</span>
          </button>
        </div>
      </aside>
      <div className={`scrim side${navOpen ? " show" : ""}`} onClick={closeNav}></div>

      <div className="dashx-content">
        <div className="ticker-bar" aria-hidden="true">
          <div className="ticker-viewport">
            <div className="ticker-track">
              {[0, 1].map((rep) => (
                <Fragment key={rep}>
                  {Array.from({ length: TICKER_REPEATS }).map((_, i) => (
                    <span className="ticker-item" key={`${rep}-${i}`}>
                      {t("dash.ticker")}
                    </span>
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
        </div>

        <main className="dashx-main">
          <header className="dashx-topbar">
            <div className="dashx-topbar-left">
              <button className="menu-toggle" aria-label="Open menu" onClick={() => setNavOpen((v) => !v)}>
                <Icon name="menu" />
              </button>
              <div>
                {isOverview && <div className="welcome">{t("dash.welcome", { name: displayNameOf(member).split(" ")[0] })}</div>}
                <h1>{t(titleKey)}</h1>
                {subKey && <div className="sub">{t(subKey)}</div>}
              </div>
            </div>
            <div className="dashx-topbar-right">
              <form className="search dashx-search" role="search" onSubmit={submitSearch}>
                <Icon name="search" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("dash.topbar.searchPlaceholder")}
                  aria-label={t("dash.topbar.searchPlaceholder")}
                />
                <button type="submit" className="dashx-search-submit" aria-label={t("common.search")}>
                  <Icon name="arrow_forward" />
                </button>
              </form>
              <LanguageMenu />
              <button
                type="button"
                className="theme-switch"
                role="switch"
                aria-checked={theme === "dark"}
                aria-label={t("dash.theme.group")}
                title={theme === "dark" ? t("dash.theme.light") : t("dash.theme.dark")}
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                <Icon name="light_mode" className="theme-switch-icon sun" />
                <Icon name="dark_mode" className="theme-switch-icon moon" />
                <span className="theme-switch-knob">
                  <Icon name={theme === "dark" ? "dark_mode" : "light_mode"} />
                </span>
              </button>
              <CustomerNotifications />
              <CustomerMenu />
            </div>
          </header>

          {children}
        </main>
      </div>
      <DashboardToast />
    </div>
  );
}

function DashboardToast() {
  const { toastMsg, toastShow } = useCrm();
  return <div className={`toast${toastShow ? " show" : ""}`}>{toastMsg}</div>;
}
