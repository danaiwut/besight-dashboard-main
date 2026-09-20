"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { fmtDate } from "../../../components/crm/CrmContext";
import { apiCall } from "../../../lib/crmApi";
import type { RewardClaimDto, RewardClaimStatus } from "../../../lib/activities";
import type { SpinResultDto } from "../../../lib/spin";
import Icon from "../../../components/Icon";

const STATUS_BADGE: Record<RewardClaimStatus, string> = { pending: "pending", fulfilled: "active", cancelled: "suspended" };

/** Everything waiting for / already given to the member: tier claims,
 *  competition prizes and spin wins, newest first. */
export default function DashboardMyRewardsPage() {
  const { t } = useLanguage();
  const [claims, setClaims] = useState<RewardClaimDto[]>([]);
  const [spinWins, setSpinWins] = useState<SpinResultDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [claimsPayload, spinPayload] = await Promise.all([
        apiCall<{ claims: RewardClaimDto[] }>("/api/me/rewards/", "GET"),
        apiCall<{ history: SpinResultDto[] }>("/api/me/spin/", "GET").catch(() => ({ history: [] as SpinResultDto[] })),
      ]);
      setClaims(claimsPayload.claims);
      setSpinWins(spinPayload.history);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("dash.myrewards.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const pending = claims.filter((c) => c.status === "pending").length;

  return (
    <>
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="rewards-coin-badge">
            <Icon name="card_giftcard" />
          </span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="rewards-hero-tier">{t("dash.myrewards.title")}</div>
            <div className="rewards-hero-subtitle">
              {pending > 0 ? t("dash.myrewards.pendingSub", { n: pending }) : t("dash.myrewards.emptySub")}
            </div>
          </div>
          <Link href="/dashboard/rewards" className="btn btn-ghost">
            {t("dash.myrewards.browseTiers")}
            <Icon name="arrow_forward" style={{ fontSize: 15 }} />
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 24 }}>…</div>
      ) : error ? (
        <div className="card" style={{ padding: 24 }}>
          <p>{error}</p>
          <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => void load()}>
            {t("common.retry")}
          </button>
        </div>
      ) : claims.length === 0 && spinWins.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-sub)" }}>
          <Icon name="redeem" style={{ fontSize: 36 }} />
          <p style={{ marginTop: 8 }}>{t("dash.myrewards.empty")}</p>
        </div>
      ) : (
        <>
          {claims.length > 0 && (
            <div className="card" style={{ padding: 20, marginBottom: 20 }}>
              <div className="panel-section-title">{t("dash.myrewards.claimsTitle")}</div>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t("dash.myrewards.col.reward")}</th>
                      <th>{t("dash.myrewards.col.kind")}</th>
                      <th>{t("dash.myrewards.col.status")}</th>
                      <th>{t("dash.myrewards.col.date")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map((claim) => (
                      <tr key={claim.id}>
                        <td>
                          <div className="cn">{claim.title}</div>
                          {claim.detail && <div className="ce">{claim.detail}</div>}
                          {claim.note && <div className="ce">📝 {claim.note}</div>}
                        </td>
                        <td>
                          <span className="badge suspended">{t(`dash.myrewards.kind.${claim.kind}`)}</span>
                        </td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[claim.status]}`}>{t(`dash.myrewards.status.${claim.status}`)}</span>
                        </td>
                        <td className="mono">{fmtDate(claim.createdAt.slice(0, 10))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {spinWins.length > 0 && (
            <div className="card" style={{ padding: 20 }}>
              <div className="panel-section-title">{t("dash.myrewards.spinTitle")}</div>
              <ul className="spin-history-list">
                {spinWins.slice(0, 20).map((h) => (
                  <li key={h.id}>
                    <span className="spin-history-icon">
                      <Icon name={h.prizeIcon} />
                    </span>
                    <span className="spin-history-text">
                      {h.prizeName}
                      <span className="spin-history-time">{fmtDate(h.spunAt.slice(0, 10))} · {t(`dash.myrewards.status.${h.status === "fulfilled" ? "fulfilled" : h.status === "cancelled" ? "cancelled" : "pending"}`)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}
