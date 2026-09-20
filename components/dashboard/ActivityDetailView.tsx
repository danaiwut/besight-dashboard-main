"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "../crm/LanguageContext";
import { useCrm, fmtDate, fmtDateTime, lot } from "../crm/CrmContext";
import { apiCall } from "../../lib/crmApi";
import Icon from "../Icon";
import { PRIZE_TIERS, RULE_KEYS, PARTNER_BROKER_CODES, type AccountCheckResult, type ActivityDto, type ActivityLeaderboardRow, type ActivityStanding } from "../../lib/activities";

export default function ActivityDetailView({ slug }: { slug: string }) {
  const { t } = useLanguage();
  const { toast } = useCrm();
  const { tradeAccounts, brokers } = useCrm();
  const [activity, setActivity] = useState<ActivityDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [check, setCheck] = useState<AccountCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [leaderboard, setLeaderboard] = useState<ActivityLeaderboardRow[]>([]);
  const [me, setMe] = useState<ActivityStanding>(null);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);

  const loadStandings = useCallback(async () => {
    try {
      const payload = await apiCall<{ leaderboard: ActivityLeaderboardRow[]; me: ActivityStanding; updatedAt?: string }>(
        `/api/activities/${slug}/leaderboard/`,
        "GET",
      );
      setLeaderboard(payload.leaderboard);
      setMe(payload.me);
      setUpdatedAt(payload.updatedAt);
    } catch {
      // Standings are informational — a failure must not hide the activity.
    }
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    // Reset to the loading state when the slug changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    apiCall<{ activity: ActivityDto }>(`/api/activities/${slug}/`, "GET")
      .then((payload) => {
        if (!cancelled) {
          setActivity(payload.activity);
          setError("");
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Activity not found");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    // Standings load after mount and re-poll so the board tracks the latest
    // score snapshots while the page is open.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStandings();
    const timer = window.setInterval(() => void loadStandings(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadStandings]);

  // Own accounts eligible for registered-mode competitions: active accounts
  // at a partner broker (the lot webhook covers partner campaign data).
  const eligibleAccounts = tradeAccounts.filter(
    (a) => a.status === "active" && PARTNER_BROKER_CODES.includes(brokers.find((b) => b.id === a.brokerId)?.code ?? ""),
  );

  async function checkAccount() {
    if (!accountId) return;
    setChecking(true);
    try {
      const payload = await apiCall<AccountCheckResult & { ok: boolean }>(`/api/activities/${slug}/check-account/`, "POST", { tradeAccountId: Number(accountId) });
      setCheck({ allowed: payload.allowed, message: payload.message, tradeId: payload.tradeId, broker: payload.broker });
    } catch (checkError) {
      setCheck(null);
      toast(checkError instanceof Error ? checkError.message : t("dash.activities.enrollFailed"));
    } finally {
      setChecking(false);
    }
  }

  async function enroll() {
    if (!accountId || !confirmed || !check?.allowed) return;
    setBusy(true);
    try {
      const payload = await apiCall<{ activity: ActivityDto }>(`/api/activities/${slug}/`, "POST", { tradeAccountId: Number(accountId) });
      setActivity(payload.activity);
      setConfirmed(false);
      toast(t("dash.activities.enrollDone", { title: payload.activity.title }));
      await loadStandings();
    } catch (enrollError) {
      toast(enrollError instanceof Error ? enrollError.message : t("dash.activities.enrollFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function cancelEnroll() {
    if (!window.confirm(t("dash.activities.cancelConfirm"))) return;
    setBusy(true);
    try {
      const payload = await apiCall<{ activity: ActivityDto }>(`/api/activities/${slug}/`, "DELETE");
      setActivity(payload.activity);
      toast(t("dash.activities.cancelDone"));
      await loadStandings();
    } catch (cancelError) {
      toast(cancelError instanceof Error ? cancelError.message : t("dash.activities.enrollFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <p className="modal-detail" style={{ textAlign: "left", margin: 0 }}>…</p>
      </div>
    );
  }

  if (error || !activity) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <p>{error || t("dash.activities.empty")}</p>
        <Link href="/dashboard/activities" className="btn btn-ghost" style={{ marginTop: 12 }}>
          {t("dash.activity.back")}
        </Link>
      </div>
    );
  }

  const rules = activity.rules.length ? activity.rules : RULE_KEYS.map((key) => t(key));

  return (
    <div>
      <Link href="/dashboard/activities" className="course-detail-back">
        <Icon name="arrow_back" />
        {t("dash.activity.back")}
      </Link>

      <div className="profile-grid activity-detail-grid">
        <div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div
              className="activity-detail-cover"
              style={activity.coverImage ? { backgroundImage: `url(${activity.coverImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
            >
              <span className={`comp-ribbon comp-ribbon-${activity.status}`}>
                {activity.status === "upcoming" &&
                  t("dash.activities.ribbon.upcoming", { start: fmtDate(activity.startDate), end: fmtDate(activity.endDate) })}
                {activity.status === "live" && t("dash.activities.liveBadge")}
                {activity.status === "finished" && t("dash.activities.ribbon.finished", { date: fmtDate(activity.endDate) })}
              </span>
              <Icon name="emoji_events" className="activity-detail-cover-icon" />
            </div>
            <div className="activity-detail-body">
              <h1 className="activity-detail-title">{activity.title}</h1>
              <div className="activity-detail-meta">
                <span>
                  <Icon name="groups" style={{ fontSize: 15 }} />
                  {t("dash.activities.traders", { n: activity.traders })}
                </span>
                <Link href="/dashboard/leaderboard">{t("dash.activities.leaderboard")}</Link>
              </div>

              {activity.description && (
                <p className="comp-card-desc" style={{ marginTop: 12, whiteSpace: "pre-line" }}>
                  {activity.description}
                </p>
              )}

              {activity.status === "finished" ? (
                <div className="activity-finished-note">{t("dash.activity.finishedNote")}</div>
              ) : activity.enrolled ? (
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span className="badge active">
                      <Icon name="check_circle" style={{ fontSize: 14 }} />
                      {t("dash.activities.enrolled")}
                    </span>
                    {activity.enrolledTradeId && (
                      <span className="badge suspended mono">{activity.enrolledTradeId}</span>
                    )}
                    {me && (
                      <span className={`badge ${me.verified ? "active" : "suspended"}`}>
                        {me.verified ? t("act.participants.verified.yes") : t("act.participants.verified.pending")}
                      </span>
                    )}
                    {me?.isDemo && <span className="badge pending">{t("act.participants.demo")}</span>}
                    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void cancelEnroll()}>
                      {t("dash.activities.cancelEnroll")}
                    </button>
                  </div>
                  {me && (
                    <div style={{ fontSize: 13, color: "var(--text-sub)" }}>
                      {t("dash.activities.myStanding", { rank: me.rank, lots: lot(me.lots) })}
                      {me.verificationNote ? ` — ${me.verificationNote}` : ""}
                    </div>
                  )}
                </div>
              ) : !activity.registrationOpen ? (
                <div className="activity-finished-note">
                  {t("dash.activities.registrationSoon", { date: activity.registrationOpensAt ? fmtDate(activity.registrationOpensAt) : "—" })}
                </div>
              ) : activity.mode !== "registered" ? (
                <div className="activity-finished-note">{t("dash.activities.frozenNote")}</div>
              ) : (
                <div style={{ marginTop: 16 }}>
                  <div className="field" style={{ maxWidth: 340, marginBottom: 0 }}>
                    <label>{t("dash.activities.tradeAccount")}</label>
                    <select
                      className="input"
                      value={accountId}
                      onChange={(e) => {
                        setAccountId(e.target.value);
                        setCheck(null);
                      }}
                      aria-label={t("dash.activities.tradeAccount")}
                    >
                      <option value="">{t("dash.activities.tradeAccountPlaceholder")}</option>
                      {eligibleAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {brokers.find((b) => b.id === a.brokerId)?.name ?? "—"} · {a.tradeId}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!eligibleAccounts.length && (
                    <p style={{ fontSize: 12.5, color: "var(--text-sub)", margin: "8px 0 0", maxWidth: 460 }}>
                      {t("dash.activities.noEligibleAccount")}
                    </p>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn btn-ghost" disabled={checking || !accountId} onClick={() => void checkAccount()}>
                      {checking ? t("dash.activities.checking") : t("dash.activities.checkAccount")}
                    </button>
                    {check && <span className={`badge ${check.allowed ? "active" : "expired"}`}>{check.message}</span>}
                  </div>
                  <p style={{ fontSize: 12.5, color: "var(--text-sub)", margin: "8px 0 10px", maxWidth: 460 }}>
                    {t("dash.activities.registeredHint")}
                  </p>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 12, maxWidth: 460 }}>
                    <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 3 }} />
                    <span style={{ fontSize: 12.5 }}>{t("dash.activities.confirmAccount")}</span>
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ alignSelf: "flex-start" }}
                    disabled={busy || !accountId || !confirmed || !check?.allowed}
                    onClick={() => void enroll()}
                  >
                    {busy ? t("dash.activities.enrolling") : t("dash.activities.enroll")}
                    <Icon name="arrow_forward" style={{ fontSize: 15 }} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 24, marginTop: 20 }}>
            <div className="panel-section-title">{t("dash.activity.prizePool.title")}</div>
            <p className="comp-card-desc" style={{ marginBottom: 16 }}>
              {t("dash.activities.prizeText")}
            </p>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("dash.activity.prizePool.rank")}</th>
                    <th>{t("dash.activity.prizePool.reward")}</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.prizes.length ? (
                    activity.prizes.map((prize) => (
                      <tr key={prize.id}>
                        <td>#{prize.rankFrom === prize.rankTo ? prize.rankFrom : `${prize.rankFrom}–${prize.rankTo}`}</td>
                        <td style={{ color: "var(--green)", fontWeight: 700 }}>
                          {prize.title}
                          {prize.valueNote ? ` · ${prize.valueNote}` : ""}
                        </td>
                      </tr>
                    ))
                  ) : (
                    PRIZE_TIERS.map((tier) => (
                      <tr key={tier.rankKey}>
                        <td>#{tier.rankKey}</td>
                        <td style={{ color: "var(--green)", fontWeight: 700 }}>${tier.amount.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="drawer-row" style={{ marginTop: 4 }}>
              <span className="k">{t("dash.activity.prizePool.total")}</span>
              <span className="v">${activity.prizePool.toFixed(2)}</span>
            </div>
          </div>

          <div className="card" style={{ padding: 24, marginTop: 20 }}>
            <div className="panel-section-title">{t("dash.activity.ranking.title")}</div>
            <p className="comp-card-desc">{t("dash.activity.ranking.body")}</p>
          </div>
        </div>

        <div className="profile-col-side">
          <div className="card" style={{ padding: 24 }}>
            <div className="panel-section-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {t("dash.activity.leaderboard.title")}
              <Link href="/dashboard/leaderboard" className="comp-rules-link">
                {t("dash.activities.leaderboard")}
              </Link>
            </div>
            {leaderboard.length ? (
              <>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{t("act.participants.col.member")}</th>
                        <th>{t("act.participants.col.lots")}</th>
                        <th>{t("dash.activities.gapToLeader")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.slice(0, 10).map((row) => {
                        const leaderLots = leaderboard[0]?.lots ?? 0;
                        const gap = Math.max(0, leaderLots - row.lots);
                        return (
                          <tr key={row.rank} style={row.isMe ? { background: "var(--bg-card2, rgba(0,0,0,0.03))" } : undefined}>
                            <td className="mono">{row.rank}</td>
                            <td>
                              {row.memberName}
                              {row.isMe ? ` · ${t("dash.activities.you")}` : ""}
                            </td>
                            <td className="mono">{lot(row.lots)}</td>
                            <td className="mono">{gap > 0 ? `-${lot(gap)}` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {updatedAt && (
                  <p style={{ fontSize: 12, color: "var(--text-sub)", marginTop: 10 }}>
                    {t("dash.activities.updatedAt", { when: fmtDateTime(updatedAt) })}
                  </p>
                )}
              </>
            ) : (
              <p className="comp-card-desc">
                {activity.status === "upcoming" ? t("dash.activity.leaderboard.empty") : t("dash.activity.leaderboard.unavailable")}
              </p>
            )}
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div className="panel-section-title">{t("dash.activity.rules.title")}</div>
            <ul className="activity-rules-list">
              {rules.map((rule, index) => (
                <li key={index}>{rule}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
