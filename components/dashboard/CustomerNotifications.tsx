"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "../crm/LanguageContext";
import { apiCall } from "../../lib/crmApi";
import type { NotificationItem } from "../../lib/server/notifications";
import Icon from "../Icon";

const ICONS: Record<NotificationItem["icon"], React.ReactNode> = {
  rebate: <Icon name="account_balance_wallet" />,
  renewal: <Icon name="autorenew" />,
  reward: <Icon name="workspace_premium" />,
  competition: <Icon name="emoji_events" />,
  claim: <Icon name="card_giftcard" />,
  spin: <Icon name="casino" />,
};

function timeAgo(iso: string, lang: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return new Date(iso).toLocaleDateString(lang === "th" ? "th-TH" : "en-US", { month: "short", day: "numeric" });
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return lang === "th" ? "เมื่อกี้นี้" : "just now";
  if (mins < 60) return lang === "th" ? `${mins} นาทีที่แล้ว` : `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return lang === "th" ? `${hours} ชม.ที่แล้ว` : `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return lang === "th" ? `${days} วันที่แล้ว` : `${days} day${days > 1 ? "s" : ""} ago`;
  return new Date(iso).toLocaleDateString(lang === "th" ? "th-TH" : "en-US", { month: "short", day: "numeric" });
}

/** Customer bell — real items derived from the member's own rows (rebate,
 *  renewals, tiers, competitions, claims, spins). Only dismissals persist. */
export default function CustomerNotifications() {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read).length;

  const load = useCallback(async () => {
    try {
      const payload = await apiCall<{ items: NotificationItem[] }>("/api/me/notifications/", "GET");
      setItems(payload.items);
    } catch {
      // Bell stays empty rather than fake — a failure must not invent news.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

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

  async function dismiss(keys: string[]) {
    if (!keys.length) return;
    setItems((cur) => cur.map((n) => (keys.includes(n.key) ? { ...n, read: true } : n)));
    try {
      await apiCall("/api/me/notifications/", "POST", { keys });
    } catch {
      // Local state already updated; the next load reconciles.
    }
  }

  function openItem(item: NotificationItem) {
    void dismiss([item.key]);
    setOpen(false);
    router.push(item.href);
  }

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
          if (!open) void load();
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
                void dismiss(items.filter((n) => !n.read).map((n) => n.key));
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
                key={n.key}
                className={`notif-item${n.read ? "" : " unread"}`}
                onClick={() => openItem(n)}
              >
                <span className="ni-ic">{ICONS[n.icon]}</span>
                <div className="ni-body">
                  <div className="ni-title">{t(n.titleKey, n.vars ?? {})}</div>
                  <div className="ni-time">{timeAgo(n.time, lang)}</div>
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
