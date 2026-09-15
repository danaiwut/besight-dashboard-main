"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageContext";
import Icon from "../Icon";

type NotifItem = {
  id: number;
  icon: "member" | "renewal" | "warn" | "telegram";
  html: string;
  time: string;
  read: boolean;
};

const ICONS: Record<NotifItem["icon"], React.ReactNode> = {
  member: <Icon name="person_add" />,
  renewal: <Icon name="autorenew" />,
  warn: <Icon name="warning" />,
  telegram: <Icon name="send" />,
};

const INITIAL: NotifItem[] = [
  { id: 1, icon: "member", html: "<strong>Emma Chen</strong> just added a new trade account, pending verification.", time: "5 min ago", read: false },
  { id: 2, icon: "renewal", html: "<strong>Marco Rossi</strong>'s indicator access renewed automatically — qualified 21.5 lots.", time: "40 min ago", read: false },
  { id: 3, icon: "warn", html: "<strong>Aisha Rahman</strong> is below the monthly lot minimum.", time: "2 hours ago", read: false },
  { id: 4, icon: "telegram", html: "<strong>Priya Nair</strong> was banned from the private Telegram room.", time: "Yesterday", read: true },
];

export default function CrmNotifications() {
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
        className="icon-btn"
        aria-label="Notifications"
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
      <div className="notif-panel" role="menu" aria-label="Notifications">
        <div className="notif-head">
          <span className="nt">{t("menu.notifications")} {unread > 0 && <span className="badge-count">{unread}</span>}</span>
          {unread > 0 && (
            <button
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
