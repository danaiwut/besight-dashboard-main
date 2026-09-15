"use client";

import { useMemo, useState } from "react";
import { useCrm, fmtDateTime } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import Icon from "../../../components/Icon";
import Pagination from "../../../components/crm/Pagination";
import { exportCsv } from "../../../lib/exportCsv";

const PAGE_SIZE = 12;

const ACTION_TONE: Record<string, string> = {
  "Indicator Renewed": "active",
  "Indicator Granted": "active",
  "Trade ID Verified": "active",
  "Lots Updated": "pending",
  "Trade ID Added": "pending",
  "Telegram Access Granted": "pending",
  "Member Added": "pending",
  "TradingView Username Changed": "warning",
  "Indicator Expired": "expired",
  "Telegram Access Removed": "expired",
  "Manual Admin Override": "suspended",
};

export default function ActivityLogsPage() {
  const { activityLogs, toast } = useCrm();
  const { t } = useLanguage();
  const [actionFilter, setActionFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const actions = useMemo(() => Array.from(new Set(activityLogs.map((l) => l.action))).sort(), [activityLogs]);

  const list = useMemo(() => {
    const q = query.toLowerCase();
    return [...activityLogs]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .filter((l) => actionFilter === "all" || l.action === actionFilter)
      .filter((l) => !q || (l.actor + " " + (l.memberName ?? "") + " " + l.description).toLowerCase().includes(q));
  }, [activityLogs, actionFilter, query]);

  const paged = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function exportRows() {
    const headers = ["Timestamp", "Actor", "Member", "Action", "Description"];
    const rows = list.map((l) => [fmtDateTime(l.timestamp), l.actor, l.memberName ?? "—", l.action, l.description]);
    exportCsv("activity-logs-export", headers, rows);
    toast(t("al.toast.exported", { n: list.length }));
  }

  return (
    <section className="panel is-active">
      <div className="card">
        <div className="toolbar">
          <select className="filter-select" aria-label="Filter by action" value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}>
            <option value="all">{t("al.allActions")}</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <div className="search">
            <Icon name="search" />
            <input type="search" placeholder={t("al.searchPlaceholder")} aria-label="Search activity logs" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          </div>
          <button className="btn btn-ghost" onClick={exportRows}>
            <Icon name="download" />
            {t("common.export")}
          </button>
        </div>

        <div className="table-wrap">
          <table className="data" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>{t("al.col.timestamp")}</th>
                <th>{t("al.col.actor")}</th>
                <th>{t("al.col.member")}</th>
                <th>{t("al.col.action")}</th>
                <th>{t("al.col.description")}</th>
              </tr>
            </thead>
            <tbody>
              {paged.length ? (
                paged.map((l) => (
                  <tr key={l.id}>
                    <td className="mono">{fmtDateTime(l.timestamp)}</td>
                    <td>{l.actor}</td>
                    <td>{l.memberName ?? "—"}</td>
                    <td>
                      <span className={`badge ${ACTION_TONE[l.action] ?? "pending"}`}>{l.action}</span>
                    </td>
                    <td style={{ whiteSpace: "normal", minWidth: 320 }}>{l.description}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    <div className="table-empty">{t("al.empty")}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>
            {list.length} {t("al.events")}
          </span>
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.length} onPageChange={setPage} />
        </div>
      </div>
    </section>
  );
}
