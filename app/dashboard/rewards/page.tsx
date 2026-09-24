"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { useCrm, fmtDate, lot } from "../../../components/crm/CrmContext";
import { useCustomerData } from "../../../components/dashboard/useCustomerData";
import { apiCall } from "../../../lib/crmApi";
import type { RewardClaimDto, RewardTierDto } from "../../../lib/activities";
import Icon from "../../../components/Icon";
import BecRatesPanel from "../../../components/dashboard/BecRatesPanel";

type ClaimState = "locked" | "available" | "pending" | "fulfilled";

/** Loyalty ladder — tiers come from the CRM (/crm/reward-tiers), progress from
 *  lifetime traded lots, and Claim creates a real fulfilment-queue row. */
export default function DashboardRewardsPage() {
  const { t, lang } = useLanguage();
  const { toast } = useCrm();
  const { member, totalLots, history } = useCustomerData();
  const [tiers, setTiers] = useState<RewardTierDto[]>([]);
  const [claims, setClaims] = useState<RewardClaimDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [becOpen, setBecOpen] = useState(false);
  const rewardsRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [tiersPayload, claimsPayload] = await Promise.all([
        apiCall<{ tiers: RewardTierDto[] }>("/api/reward-tiers/", "GET"),
        apiCall<{ claims: RewardClaimDto[] }>("/api/me/rewards/", "GET"),
      ]);
      setTiers(tiersPayload.tiers);
      setClaims(claimsPayload.claims.filter((c) => c.kind === "tier"));
    } catch {
      // Ladder stays empty rather than fake — the page renders the locked state.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Old /dashboard/bec-rates links land here with ?bec=1.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the URL
    if (new URLSearchParams(window.location.search).get("bec") === "1") setBecOpen(true);
  }, []);

  useEffect(() => {
    if (!becOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBecOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [becOpen]);

  function copyCode() {
    navigator.clipboard
      ?.writeText(member.code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function claim(tierKey: string) {
    if (claimingKey) return;
    setClaimingKey(tierKey);
    try {
      const payload = await apiCall<{ claim: RewardClaimDto }>("/api/me/rewards/", "POST", { tierKey });
      setClaims((cur) => [payload.claim, ...cur]);
      toast(t("dash.rewards.claimSent"));
    } catch (claimError) {
      toast(claimError instanceof Error ? claimError.message : t("dash.rewards.claimFailed"));
    } finally {
      setClaimingKey(null);
    }
  }

  const titleOf = (tier: RewardTierDto) => (lang === "th" ? tier.title : tier.titleEn || tier.title);
  const rewardOf = (tier: RewardTierDto) => (lang === "th" ? tier.reward : tier.rewardEn || tier.reward);
  const claimOf = (key: string) => claims.find((c) => c.refKey === `tier:${key}`);

  let currentIndex = -1;
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (totalLots >= tiers[i].threshold) {
      currentIndex = i;
      break;
    }
  }
  const nextTier = tiers[currentIndex + 1];
  const lastUpdated = history[0]?.tradeDate;
  const periodYear = (lastUpdated ?? "2026").slice(0, 4);

  function claimState(tier: RewardTierDto): ClaimState {
    const claim = claimOf(tier.key);
    if (claim) return claim.status === "fulfilled" ? "fulfilled" : "pending";
    return totalLots >= tier.threshold ? "available" : "locked";
  }

  return (
    <>
      <div className="rewards-top">
        <div className="card rewards-member-card">
          <div className="rewards-member-header">
            <div className="rewards-member-top">
              <span className="rewards-member-label">{t("dash.rewards.memberInfoLabel")}</span>
              <div className="rewards-member-code-row">
                <span className="mono">{member.code}</span>
                <button onClick={copyCode} aria-label={t("dash.wallet.copyCode")} title={copied ? t("dash.wallet.copied") : t("dash.wallet.copyCode")}>
                  <Icon name={copied ? "check" : "content_copy"} style={{ fontSize: 15 }} />
                </button>
              </div>
            </div>
            <div className="rewards-member-code-label">{t("dash.rewards.memberCode")}</div>
          </div>

          <div className="rewards-member-stat">
            <span className="rewards-coin-badge">
              <Icon name="paid" />
            </span>
            <div>
              <div className="rewards-coin-label">{t("dash.rewards.loyaltyLots")}</div>
              <div className="rewards-coin-row">
                <span className="rewards-coin-value">{lot(totalLots)}</span>
                <span className="rewards-coin-unit">{t("dash.rewards.lotsUnit")}</span>
              </div>
            </div>
          </div>

          <div className="rewards-member-stat">
            <span className="rewards-coin-badge">
              <Icon name="calendar_month" />
            </span>
            <div>
              <div className="rewards-coin-label">{t("dash.rewards.updatedLabel")}</div>
              <div className="rewards-member-date">{lastUpdated ? fmtDate(lastUpdated) : t("dash.rewards.notUpdated")}</div>
            </div>
          </div>

          <Link href="/dashboard/my-rewards" className="btn btn-ghost" style={{ width: "100%", marginTop: 12 }}>
            <Icon name="card_giftcard" style={{ fontSize: 16 }} />
            {t("dash.rewards.myRewardsCta")}
          </Link>
          <button type="button" className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} onClick={() => setBecOpen(true)}>
            <Icon name="toll" style={{ fontSize: 16 }} />
            {t("dash.rewards.becRatesCta")}
          </button>
        </div>

        <div className="card rewards-hero-card">
          <div className="rewards-hero-top">
            <div className="rewards-hero-title-row">
              <span
                className="rewards-hero-medal"
                style={
                  currentIndex >= 0
                    ? { background: `${tiers[currentIndex].accent}33`, borderColor: `${tiers[currentIndex].accent}99` }
                    : undefined
                }
              >
                <Icon
                  name={currentIndex >= 0 ? tiers[currentIndex].icon : "hourglass_empty"}
                  style={currentIndex >= 0 ? { color: tiers[currentIndex].accent } : { color: "#fff" }}
                />
              </span>
              <div>
                <div className="rewards-hero-eyebrow">{t("dash.rewards.currentTierLabel")}</div>
                <div className="rewards-hero-tier">
                  {loading ? "…" : currentIndex >= 0 ? titleOf(tiers[currentIndex]) : t("dash.rewards.tier.nonActive")}
                </div>
                <div className="rewards-hero-subtitle">{t("dash.rewards.tierSubtitle")}</div>
              </div>
            </div>
            {nextTier && (
              <div className="rewards-hero-fraction">
                {lot(totalLots)} / {lot(nextTier.threshold)} Lot
                <div className="l">{t("dash.rewards.nextTierLabel")}</div>
              </div>
            )}
          </div>

          {!!tiers.length && (
            <div className="rewards-stepper">
              {tiers.map((tier, i) => {
                const reached = i <= currentIndex;
                const isCurrent = i === currentIndex;
                return (
                  <div className={`step${reached ? " done" : ""}${isCurrent ? " current" : ""}`} key={tier.key}>
                    <div className="line" />
                    <span className="dot">
                      <Icon name={reached ? tier.icon : "lock"} />
                    </span>
                    <span className="label">{titleOf(tier)}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rewards-hero-bottom">
            <span>
              <Icon name="info" style={{ fontSize: 14 }} />
              {t("dash.rewards.tierNote")}
            </span>
            <button type="button" className="rewards-hero-detail-btn" onClick={() => scrollTo(rewardsRef)}>
              {t("dash.rewards.viewDetail")}
              <Icon name="arrow_forward" style={{ fontSize: 14 }} />
            </button>
          </div>
        </div>
      </div>

      <h2 className="rewards-programs-title" ref={rewardsRef}>
        {t("dash.rewards.programsTitle")}
      </h2>
      <div className="rewards-programs-period">{t("dash.rewards.programsPeriod", { year: periodYear })}</div>

      <div className="rewards-cards-row">
        {tiers.map((tier, i) => {
          const number = tiers.length - i;
          const state = claimState(tier);
          const pct = Math.min(100, Math.round((totalLots / Math.max(tier.threshold, 0.0001)) * 100));
          return (
            <div className={`reward-card${state === "fulfilled" || state === "available" ? " achieved" : ""}`} key={tier.key}>
              <span className="reward-card-badge">{t("dash.rewards.rewardBadge", { n: number })}</span>
              <span className="reward-card-icon">
                {tier.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin-provided reward photo, sized/cropped by CSS
                  <img src={tier.image} alt="" />
                ) : (
                  <Icon name={tier.icon} />
                )}
              </span>
              <div className="reward-card-title">{rewardOf(tier)}</div>
              <div className="reward-card-pct">{pct}%</div>
              <div className="reward-card-track">
                <span className="reward-card-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="reward-card-frac">
                {lot(totalLots)}/{lot(tier.threshold)} {t("dash.rewards.lotsUnit")}
              </div>
              {state === "fulfilled" ? (
                <button className="btn btn-ghost" disabled>
                  <Icon name="check_circle" style={{ fontSize: 15 }} />
                  {t("dash.rewards.claimed")}
                </button>
              ) : state === "pending" ? (
                <button className="btn btn-ghost" disabled>
                  <Icon name="schedule" style={{ fontSize: 15 }} />
                  {t("dash.rewards.claimPending")}
                </button>
              ) : (
                <button
                  className={`btn ${state === "available" ? "btn-primary" : "btn-ghost"}`}
                  disabled={state !== "available" || claimingKey !== null}
                  onClick={() => void claim(tier.key)}
                >
                  {claimingKey === tier.key ? t("dash.rewards.claiming") : t("dash.rewards.claim")}
                  <Icon name="arrow_forward" style={{ fontSize: 15 }} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="rewards-banner">
        <div className="rewards-banner-text">
          {/* eslint-disable-next-line @next/next/no-img-element -- brand mark, sized inline */}
          <img src="/img/be-alone-color.png" alt="BeSight" />
          <div>
            <div className="rewards-banner-title">{t("dash.rewards.banner.title")}</div>
            <div className="rewards-banner-sub">
              {t("dash.rewards.banner.sub")} <span>|</span> {t("dash.rewards.banner.tagline")}
            </div>
          </div>
        </div>
        <button type="button" className="rewards-banner-arrow" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top">
          <Icon name="chevron_right" />
        </button>
      </div>
      {becOpen && (
        <>
          <div className="modal-scrim show" onClick={() => setBecOpen(false)}></div>
          <div className="modal show bec-rates-modal" role="dialog" aria-modal="true" aria-labelledby="bec-rates-title">
            <div className="bec-rates-modal-head">
              <div>
                <h3 className="modal-title" id="bec-rates-title">{t("dash.title.becRates")}</h3>
                <div className="bec-rates-modal-sub">{t("dash.sub.becRates")}</div>
              </div>
              <button type="button" className="kebab" aria-label={t("common.close")} onClick={() => setBecOpen(false)}>
                <Icon name="close" />
              </button>
            </div>
            <BecRatesPanel />
          </div>
        </>
      )}
    </>
  );
}
