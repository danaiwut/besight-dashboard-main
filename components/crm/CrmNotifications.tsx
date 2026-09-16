"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageContext";
import { NotificationsSkeleton } from "./Skeletons";
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

const INITIAL: NotifItem[] = [];

function relativeTime(timestamp: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function CrmNotifications() {
  const { t } = useLanguage();
  const [items, setItems] = useState<NotifItem[]>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read).length;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/notifications/", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; notifications?: Array<Omit<NotifItem, "time"> & { timestamp: string }> };
        if (cancelled || !response.ok || !payload.ok || !payload.notifications) return;
        setItems(payload.notifications.map((item) => ({ ...item, time: relativeTime(item.timestamp) })));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function markRead(id: number) {
    setItems((cur) => cur.map((item) => item.id === id ? { ...item, read: true } : item));
    void fetch("/api/crm/activity-logs/", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => undefined);
  }

  function markAllRead() {
    setItems((cur) => cur.map((item) => ({ ...item, read: true })));
    void fetch("/api/crm/activity-logs/", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }).catch(() => undefined);
  }

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
                markAllRead();
              }}
            >
              {t("menu.markAllRead")}
            </button>
          )}
        </div>
        <div className="notif-list">
          {loading ? (
            <NotificationsSkeleton />
          ) : items.length ? (
            items.map((n) => (
              <div
                key={n.id}
                className={`notif-item${n.read ? "" : " unread"}`}
                onClick={() => markRead(n.id)}
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
