"use client";

import { useRef, useState } from "react";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { useCrm, fmtDate, lot } from "../../../components/crm/CrmContext";
import { useCustomerData } from "../../../components/dashboard/useCustomerData";
import Icon from "../../../components/Icon";

type Tier = {
  key: string;
  icon: string;
  accent: string;
  lotsRequired: number;
  titleKey: string;
  rewardKey: string;
  rewardIcon: string;
  rewardImage?: string;
};

const TIERS: Tier[] = [
  { key: "nonActive", icon: "hourglass_empty", accent: "#6B7280", lotsRequired: 0, titleKey: "dash.rewards.tier.nonActive", rewardKey: "", rewardIcon: "" },
  { key: "bronze", icon: "military_tech", accent: "#A3673F", lotsRequired: 1, titleKey: "dash.rewards.tier.bronze", rewardKey: "dash.rewards.reward.bronze", rewardIcon: "payments", rewardImage: "/img/Loyalty/rebate-boost.jpg" },
  { key: "silver", icon: "military_tech", accent: "#9AA3B0", lotsRequired: 50, titleKey: "dash.rewards.tier.silver", rewardKey: "dash.rewards.reward.silver", rewardIcon: "card_giftcard", rewardImage: "/img/Loyalty/cash-bonus.jpg" },
  { key: "gold", icon: "military_tech", accent: "#D4AF37", lotsRequired: 150, titleKey: "dash.rewards.tier.gold", rewardKey: "dash.rewards.reward.gold", rewardIcon: "visibility", rewardImage: "/img/Loyalty/orca-indicator.jpg" },
  { key: "beyond", icon: "rocket_launch", accent: "#2F6FED", lotsRequired: 500, titleKey: "dash.rewards.tier.beyond", rewardKey: "dash.rewards.reward.beyond", rewardIcon: "smartphone", rewardImage: "/img/Loyalty/flagship-phone.jpg" },
  { key: "exclusive", icon: "diamond", accent: "#8B3FE0", lotsRequired: 2000, titleKey: "dash.rewards.tier.exclusive", rewardKey: "dash.rewards.reward.exclusive", rewardIcon: "directions_car", rewardImage: "/img/Loyalty/geely20ex2-1775018889656.webp" },
];

// Standard-ladder tiers (silver/gold) collapse to a plain lock glyph until
// reached; the two aspirational tiers keep their own icon even locked so
// they stay recognisable/enticing further up the ladder.
const ALWAYS_OWN_ICON = new Set(["nonActive", "bronze", "beyond", "exclusive"]);

const REWARD_TIERS = TIERS.slice(1);

export default function DashboardRewardsPage() {
  const { t } = useLanguage();
  const { toast } = useCrm();
  const { member, totalLots, history } = useCustomerData();
  const [copied, setCopied] = useState(false);
  const rewardsRef = useRef<HTMLDivElement>(null);

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

  let currentIndex = 0;
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (totalLots >= TIERS[i].lotsRequired) {
      currentIndex = i;
      break;
    }
  }
  const currentTier = TIERS[currentIndex];
  const nextTier = TIERS[currentIndex + 1];
  const lastUpdated = history[0]?.tradeDate;
  const periodYear = (lastUpdated ?? "2026").slice(0, 4);

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
        </div>

        <div className="card rewards-hero-card">
          <div className="rewards-hero-top">
            <div className="rewards-hero-title-row">
              <span className="rewards-hero-medal" style={{ background: `${currentTier.accent}33`, borderColor: `${currentTier.accent}99` }}>
                <Icon name={currentTier.icon} style={{ color: currentTier.accent === "#6B7280" ? "#fff" : currentTier.accent }} />
              </span>
              <div>
                <div className="rewards-hero-eyebrow">{t("dash.rewards.currentTierLabel")}</div>
                <div className="rewards-hero-tier">{t(currentTier.titleKey)}</div>
                <div className="rewards-hero-subtitle">{t("dash.rewards.tierSubtitle")}</div>
              </div>
            </div>
            {nextTier && (
              <div className="rewards-hero-fraction">
                {lot(totalLots)} / {lot(nextTier.lotsRequired)} Lot
                <div className="l">{t("dash.rewards.nextTierLabel")}</div>
              </div>
            )}
          </div>

          <div className="rewards-stepper">
            {TIERS.map((tier, i) => {
              const reached = i <= currentIndex;
              const isCurrent = i === currentIndex;
              const showLock = !reached && !ALWAYS_OWN_ICON.has(tier.key);
              return (
                <div className={`step${reached ? " done" : ""}${isCurrent ? " current" : ""}`} key={tier.key}>
                  <div className="line" />
                  <span className="dot">
                    <Icon name={showLock ? "lock" : tier.icon} />
                  </span>
                  <span className="label">{t(tier.titleKey)}</span>
                </div>
              );
            })}
          </div>

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
        {REWARD_TIERS.map((tier, i) => {
          const number = REWARD_TIERS.length - i;
          const achieved = totalLots >= tier.lotsRequired;
          const pct = Math.min(100, Math.round((totalLots / tier.lotsRequired) * 100));
          return (
            <div className={`reward-card${achieved ? " achieved" : ""}`} key={tier.key}>
              <span className="reward-card-badge">{t("dash.rewards.rewardBadge", { n: number })}</span>
              <span className="reward-card-icon">
                {tier.rewardImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- reward photo, sized/cropped by CSS
                  <img src={tier.rewardImage} alt="" />
                ) : (
                  <Icon name={tier.rewardIcon} />
                )}
              </span>
              <div className="reward-card-title">{t(tier.rewardKey)}</div>
              <div className="reward-card-pct">{pct}%</div>
              <div className="reward-card-track">
                <span className="reward-card-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="reward-card-frac">
                {lot(totalLots)}/{lot(tier.lotsRequired)} {t("dash.rewards.lotsUnit")}
              </div>
              <button
                className={`btn ${achieved ? "btn-primary" : "btn-ghost"}`}
                disabled={!achieved}
                onClick={() => toast(t("dash.rewards.claimToast", { reward: t(tier.rewardKey) }))}
              >
                {t("dash.rewards.claim")}
                <Icon name="arrow_forward" style={{ fontSize: 15 }} />
              </button>
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
    </>
  );
}
