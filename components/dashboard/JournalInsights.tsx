"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "../crm/LanguageContext";
import { apiCall } from "../../lib/crmApi";
import type { InsightDto } from "../../lib/journal";
import Icon from "../Icon";

const TONE_ICON: Record<InsightDto["tone"], string> = { good: "check_circle", bad: "warning", neutral: "info" };
const TONE_CLASS: Record<InsightDto["tone"], string> = { good: "active", bad: "expired", neutral: "pending" };

/** Rule-based coaching notes from the account's own trades — deterministic,
 *  computed server-side on read, never stored. */
export default function JournalInsights({ accountId }: { accountId: number }) {
  const { t } = useLanguage();
  const [insights, setInsights] = useState<InsightDto[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const payload = await apiCall<{ insights: InsightDto[] }>(`/api/me/journal/accounts/${accountId}/insights/`, "GET");
      setInsights(payload.insights);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("dash.journal.insights.failed"));
    }
  }, [accountId, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInsights(null);
    void load();
  }, [load]);

  return (
    <div className="card" style={{ padding: 24, marginTop: 20 }}>
      <div className="panel-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="auto_awesome" style={{ fontSize: 18 }} />
        {t("dash.journal.insights.title")}
        <button type="button" className="kebab" aria-label={t("dash.journal.insights.refresh")} title={t("dash.journal.insights.refresh")} onClick={() => void load()}>
          <Icon name="sync" />
        </button>
      </div>
      {insights === null ? (
        <p className="modal-detail" style={{ textAlign: "left", margin: 0 }}>…</p>
      ) : error ? (
        <p style={{ fontSize: 13, color: "var(--red)" }}>{error}</p>
      ) : insights.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          {insights.map((insight) => (
            <div
              key={insight.key}
              style={{
                display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px",
                border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-card2)",
              }}
            >
              <Icon name={TONE_ICON[insight.tone]} style={{ fontSize: 20, marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                  {insight.title}
                  <span className={`badge ${TONE_CLASS[insight.tone]}`} style={{ marginLeft: 8 }}>
                    {t(`dash.journal.insights.tone.${insight.tone}`)}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 2 }}>{insight.detail}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--text-sub)", margin: 0 }}>{t("dash.journal.insights.empty")}</p>
      )}
    </div>
  );
}
