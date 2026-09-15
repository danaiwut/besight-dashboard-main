"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../crm/LanguageContext";
import Icon from "../Icon";

type NotifItem = {
  id: number;
  icon: "rebate" | "renewal" | "reward" | "competition";
  html: string;
  time: string;
  read: boolean;
};

const ICONS: Record<NotifItem["icon"], React.ReactNode> = {
  rebate: <Icon name="account_balance_wallet" />,
  renewal: <Icon name="autorenew" />,
  reward: <Icon name="workspace_premium" />,
  competition: <Icon name="emoji_events" />,
};

// Self-contained local state, same pattern as the admin CrmNotifications —
// there's no shared "notifications" data model in CrmContext for either side.
const INITIAL: NotifItem[] = [
  { id: 1, icon: "rebate", html: "You received <strong>$12.68</strong> in rebate credit.", time: "5 min ago", read: false },
  { id: 2, icon: "renewal", html: "<strong>BeSight ONE</strong> indicator access renews in 3 days.", time: "1 hour ago", read: false },
  { id: 3, icon: "reward", html: "You've unlocked the <strong>Silver Tier</strong> — new rewards available.", time: "Yesterday", read: false },
  { id: 4, icon: "competition", html: "The <strong>September Competition</strong> is live — check your standing.", time: "2 days ago", read: true },
];

export default function CustomerNotifications() {
  const { t } = useLanguage();
  const [items, setItems] = useState<NotifItem[]>(INITIAL);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read).length;

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
    <div className={`notif${open ? " open" : ""}`} ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-label={t("menu.notifications")}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {unread > 0 && <span className="dot"></span>}
        <Icon name="notifications" />
      </button>
      <div className="notif-panel" role="menu" aria-label={t("menu.notifications")}>
        <div className="notif-head">
          <span className="nt">
            {t("menu.notifications")} {unread > 0 && <span className="badge-count">{unread}</span>}
          </span>
          {unread > 0 && (
            <button
              type="button"
              className="notif-mark"
              onClick={(e) => {
                e.stopPropagation();
                setItems((cur) => cur.map((n) => ({ ...n, read: true })));
              }}
            >
              {t("menu.markAllRead")}
            </button>
          )}
        </div>
        <div className="notif-list">
          {items.length ? (
            items.map((n) => (
              <div
                key={n.id}
                className={`notif-item${n.read ? "" : " unread"}`}
                onClick={() => setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)))}
              >
                <span className="ni-ic">{ICONS[n.icon]}</span>
                <div className="ni-body">
                  <div className="ni-title" dangerouslySetInnerHTML={{ __html: n.html }} />
                  <div className="ni-time">{n.time}</div>
                </div>
                <span className="ni-dot"></span>
              </div>
            ))
          ) : (
            <div className="notif-empty">{t("menu.allCaughtUp")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
