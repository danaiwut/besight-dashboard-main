"use client";

import { useMemo, useState } from "react";
import { useCrm, accessLabel, primaryIndicatorAccess, telegramBadgeClass, telegramStatusLabelKey, fmtDate, cap, type TelegramAccess } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { TelegramSkeleton } from "../../../components/crm/Skeletons";
import { apiCall } from "../../../lib/crmApi";
import Icon from "../../../components/Icon";
import Pagination from "../../../components/crm/Pagination";
import { exportCsv } from "../../../lib/exportCsv";

const PAGE_SIZE = 10;

export default function TelegramAccessPage() {
  const { members, telegramAccess, setTelegramAccess, indicatorAccess, settings, toast, log, crmDataStatus, backendLive } = useCrm();
  const { t } = useLanguage();
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const memberOf = (id: number) => members.find((m) => m.id === id);
  const accessOf = (memberId: number) => primaryIndicatorAccess(memberId, indicatorAccess);

  const list = useMemo(() => {
    const q = query.toLowerCase();
    return telegramAccess
      .filter((tg) => statusFilter === "all" || tg.status === statusFilter)
      .filter((tg) => {
        const m = memberOf(tg.memberId);
        if (!q) return true;
        return (tg.username + " " + tg.userId + " " + (m?.name ?? "") + " " + (m?.email ?? "")).toLowerCase().includes(q);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telegramAccess, statusFilter, query, members]);

  const paged = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function expireAccess(id: number, today: string) {
    if (!backendLive) return false;
    try {
      const payload = await apiCall<{ telegramAccess: TelegramAccess }>(`/api/crm/telegram-access/${id}/`, "PATCH", {
        status: "expired",
        expiryDate: today,
      });
      setTelegramAccess((cur) => cur.map((x) => (x.id === id ? payload.telegramAccess : x)));
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to update Telegram access");
      return false;
    }
  }

  function removeAccess(id: number) {
    const rec = telegramAccess.find((x) => x.id === id);
    const m = rec ? memberOf(rec.memberId) : undefined;
    const today = new Date().toISOString().slice(0, 10);
    if (backendLive) {
      void (async () => {
        if (!(await expireAccess(id, today))) return;
        log({ memberId: rec?.memberId, memberName: m?.name, action: "Telegram Access Removed", description: `${m?.name ?? "Member"} removed from ${rec?.room ?? "the private room"} — webhook event queued for the Telegram bot.` });
        toast(t("tg.toast.removed", { name: m?.name ?? "Member" }));
      })();
      return;
    }
    setTelegramAccess((cur) => cur.map((x) => (x.id === id ? { ...x, status: "expired", expiryDate: today } : x)));
    log({ memberId: rec?.memberId, memberName: m?.name, action: "Telegram Access Removed", description: `${m?.name ?? "Member"} removed from ${rec?.room ?? "the private room"} — webhook event queued for the Telegram bot.` });
    toast(t("tg.toast.removed", { name: m?.name ?? "Member" }));
  }

  function syncWithIndicator() {
    if (!settings.telegramAutoRemove) {
      toast(t("tg.toast.autoRemoveOff"));
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (!backendLive) {
      let removed = 0;
      setTelegramAccess((cur) =>
        cur.map((tg) => {
          if (tg.status !== "active") return tg;
          const label = accessLabel(accessOf(tg.memberId), settings);
          if (label !== "Expired") return tg;
          const m = memberOf(tg.memberId);
          log({ actor: "System", memberId: tg.memberId, memberName: m?.name, action: "Telegram Access Removed", description: `Indicator access expired — removed from ${tg.room}. Webhook event queued for the Telegram bot.` });
          removed++;
          return { ...tg, status: "expired" as const, expiryDate: today };
        })
      );
      toast(removed ? t("tg.toast.syncedSome", { n: removed }) : t("tg.toast.syncedNone"));
      return;
    }
    void (async () => {
      let removed = 0;
      for (const tg of telegramAccess) {
        if (tg.status !== "active") continue;
        const label = accessLabel(accessOf(tg.memberId), settings);
        if (label !== "Expired") continue;
        const m = memberOf(tg.memberId);
        if (await expireAccess(tg.id, today)) {
          log({ actor: "System", memberId: tg.memberId, memberName: m?.name, action: "Telegram Access Removed", description: `Indicator access expired — removed from ${tg.room}. Webhook event queued for the Telegram bot.` });
          removed++;
        }
      }
      toast(removed ? t("tg.toast.syncedSome", { n: removed }) : t("tg.toast.syncedNone"));
    })();
  }

  function exportRows() {
    const headers = ["Member", "Email", "Telegram Username", "Telegram User ID", "Room", "Access Status", "Granted Date", "Expiry Date"];
    const rows = list.map((tg) => {
      const m = memberOf(tg.memberId);
      return [m?.name ?? "—", m?.email ?? "—", tg.username, tg.userId, tg.room, cap(tg.status), fmtDate(tg.grantedDate), fmtDate(tg.expiryDate)];
    });
    exportCsv("telegram-access-export", headers, rows);
    toast(t("tg.toast.exported", { n: list.length }));
  }

  if (crmDataStatus === "loading") return <TelegramSkeleton />;

  return (
    <section className="panel is-active">
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div>
            <strong style={{ fontSize: 13.5 }}>{t("tg.syncTitle")}</strong>
            <div style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 2 }}>{t("tg.syncDesc")}</div>
          </div>
          <button className="btn btn-primary" onClick={syncWithIndicator}>
            {t("tg.runSync")}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <select className="filter-select" aria-label="Filter by status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="all">{t("ia.allStatus")}</option>
            <option value="active">{t("common.active")}</option>
            <option value="pending">{t("common.pending")}</option>
            <option value="expired">{t("common.expired")}</option>
            <option value="banned">{t("common.banned")}</option>
          </select>
          <div className="search">
            <Icon name="search" />
            <input type="search" placeholder={t("tg.searchPlaceholder")} aria-label="Search telegram access" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          </div>
          <button className="btn btn-ghost" onClick={exportRows}>
            <Icon name="download" />
            {t("common.export")}
          </button>
        </div>

        <div className="table-wrap">
          <table className="data" style={{ minWidth: 1000 }}>
            <thead>
              <tr>
                <th>{t("tg.col.member")}</th>
                <th>{t("tg.col.username")}</th>
                <th>{t("tg.col.userId")}</th>
                <th>{t("tg.col.room")}</th>
                <th>{t("tg.col.accessStatus")}</th>
                <th>{t("tg.col.grantedDate")}</th>
                <th>{t("tg.col.expiryDate")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paged.length ? (
                paged.map((tg) => {
                  const m = memberOf(tg.memberId);
                  return (
                    <tr key={tg.id}>
                      <td>
                        <div className="cn">{m?.name ?? "—"}</div>
                        <div className="ce">{m?.email ?? ""}</div>
                      </td>
                      <td className="mono">{tg.username}</td>
                      <td className="mono">{tg.userId}</td>
                      <td>{tg.room}</td>
                      <td>
                        <span className={`badge ${telegramBadgeClass(tg.status)}`}>{t(telegramStatusLabelKey(tg.status))}</span>
                      </td>
                      <td className="mono">{fmtDate(tg.grantedDate)}</td>
                      <td className="mono">{fmtDate(tg.expiryDate)}</td>
                      <td className="row-actions">
                        {tg.status === "active" && (
                          <button className="btn btn-ghost" style={{ padding: "6px 12px" }} onClick={() => removeAccess(tg.id)}>
                            {t("tg.remove")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8}>
                    <div className="table-empty">{t("tg.empty")}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>{t("ia.footerCount", { n: list.length })}</span>
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.length} onPageChange={setPage} />
        </div>
      </div>
    </section>
  );
}
