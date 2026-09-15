"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { useCrm } from "../../../components/crm/CrmContext";
import { useCustomerData } from "../../../components/dashboard/useCustomerData";
import Icon from "../../../components/Icon";

type Segment = {
  key: string;
  icon: string;
  labelKey: string;
  kind: "rebate" | "indicator" | "extraSpin" | "tryAgain" | "jackpot";
  cashValue?: number; // USD credited to the spin wallet when this segment is won
};

// 8 equal 45° wedges — probability matches visual size (no hidden weighting).
// This is the sole source of truth for both what's drawn on the wheel and
// what a spin can actually award — the UI never invents a result the wheel
// doesn't show.
const SEGMENTS: Segment[] = [
  { key: "r2", icon: "payments", labelKey: "dash.spin.prize.rebate2", kind: "rebate", cashValue: 2 },
  { key: "again1", icon: "replay", labelKey: "dash.spin.prize.tryAgain", kind: "tryAgain" },
  { key: "r5", icon: "payments", labelKey: "dash.spin.prize.rebate5", kind: "rebate", cashValue: 5 },
  { key: "ind1", icon: "donut_large", labelKey: "dash.spin.prize.indicatorDay", kind: "indicator" },
  { key: "r10", icon: "payments", labelKey: "dash.spin.prize.rebate10", kind: "rebate", cashValue: 10 },
  { key: "extra", icon: "add_circle", labelKey: "dash.spin.prize.extraSpin", kind: "extraSpin" },
  { key: "r20", icon: "payments", labelKey: "dash.spin.prize.rebate20", kind: "rebate", cashValue: 20 },
  { key: "jackpot", icon: "emoji_events", labelKey: "dash.spin.prize.jackpot", kind: "jackpot", cashValue: 50 },
];

const SEG_ANGLE = 360 / SEGMENTS.length;
const SPIN_MS = 5000; // must track the .spin-wheel transition-duration in dashboard.css
const BEST_REWARD = SEGMENTS.find((s) => s.kind === "jackpot") ?? SEGMENTS[0];
const WALLET_MIN_WITHDRAW = 15;

type HistoryEntry = { key: string; labelKey: string; icon: string; at: number };
type ConfettiVars = CSSProperties & { "--dx": string; "--dy": string; "--rot": string };

function formatSpinTime(at: number, t: (key: string) => string) {
  const d = new Date(at);
  const now = new Date();
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (sameDay(d, now)) return `${t("dash.spin.history.today")}, ${time}`;
  if (sameDay(d, yesterday)) return `${t("dash.spin.history.yesterday")}, ${time}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function SpinWheelPage() {
  const { t } = useLanguage();
  const { toast } = useCrm();
  const { totalLots } = useCustomerData();

  const [spinsUsed, setSpinsUsed] = useState(0);
  const [bonusSpins, setBonusSpins] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [result, setResult] = useState<Segment | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiSeed, setConfettiSeed] = useState(0);
  const [mounted, setMounted] = useState(false);
  const spinTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confettiTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spinBtnRef = useRef<HTMLButtonElement>(null);
  const modalBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // createPortal needs a real document.body, which only exists client-side.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (result) modalBtnRef.current?.focus();
  }, [result]);

  useEffect(() => {
    if (!result) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeResult();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [result]);

  const earnedSpins = Math.floor(totalLots);
  const availableSpins = Math.max(0, earnedSpins + bonusSpins - spinsUsed);
  const canSpin = availableSpins > 0 && !spinning;

  function closeResult() {
    setResult(null);
    spinBtnRef.current?.focus();
  }

  function requestWithdrawal() {
    if (walletBalance < WALLET_MIN_WITHDRAW) return;
    toast(t("dash.spin.wallet.withdrawToast", { amount: walletBalance.toFixed(2) }));
    setWalletBalance(0);
  }

  function spin() {
    if (!canSpin) return;
    setSpinning(true);
    setSpinsUsed((n) => n + 1);

    const index = Math.floor(Math.random() * SEGMENTS.length);
    const jitter = (Math.random() - 0.5) * SEG_ANGLE * 0.6;
    const targetWithinTurn = 360 - (index * SEG_ANGLE + SEG_ANGLE / 2) + jitter;
    const extraTurns = 6;
    setRotation((cur) => cur - (cur % 360) + extraTurns * 360 + targetWithinTurn);

    if (spinTimeout.current) clearTimeout(spinTimeout.current);
    spinTimeout.current = setTimeout(() => {
      setSpinning(false);
      const seg = SEGMENTS[index];
      setHistory((cur) => [{ key: `${seg.key}-${Date.now()}`, labelKey: seg.labelKey, icon: seg.icon, at: Date.now() }, ...cur].slice(0, 6));
      if (seg.kind === "extraSpin") setBonusSpins((n) => n + 1);
      if (seg.cashValue) setWalletBalance((n) => n + seg.cashValue!);
      setResult(seg);

      if (seg.kind !== "tryAgain") {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!reduceMotion) {
          setConfettiSeed((k) => k + 1);
          setShowConfetti(true);
          if (confettiTimeout.current) clearTimeout(confettiTimeout.current);
          confettiTimeout.current = setTimeout(() => setShowConfetti(false), 1400);
        }
      }
    }, SPIN_MS);
  }

  const isTryAgain = result?.kind === "tryAgain";

  return (
    <div className="spin-shell">
      <div className="card spin-hero">
        <span className="spin-hero-eyebrow">
          <Icon name="redeem" />
          {t("dash.spin.eyebrow")}
        </span>
        <p className="spin-hero-sub">{t("dash.spin.subheading")}</p>

        <div className="spin-page">
          <div className="spin-decor" aria-hidden="true" />
          <div className="spin-wheel-col">
            <div className="spin-wheel-wrap">
              <div className="spin-wheel-pointer" aria-hidden="true" />
              <div className="spin-wheel-rim" aria-hidden="true" />
              <div className="spin-wheel" style={{ transform: `rotate(${rotation}deg)` }} role="img" aria-label={t("dash.title.spinWheel")}>
                {SEGMENTS.map((seg, i) => {
                  const angle = i * SEG_ANGLE + SEG_ANGLE / 2;
                  const dark = i % 2 === 0;
                  return (
                    <div className="spin-wheel-seg" style={{ transform: `rotate(${angle}deg)` }} key={seg.key}>
                      <span className={`spin-wheel-seg-label${dark ? " on-blue" : ""}`} style={{ transform: `rotate(${-angle}deg)` }}>
                        <Icon name={seg.icon} />
                        <span>{t(seg.labelKey)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="spin-wheel-hub">
                <span>SPIN</span>
              </div>
              {showConfetti && (
                <div className="spin-confetti" key={confettiSeed} aria-hidden="true">
                  {Array.from({ length: 18 }).map((_, i) => {
                    const angle = (i / 18) * 360 + Math.random() * 20;
                    const dist = 90 + Math.random() * 70;
                    const dx = Math.cos((angle * Math.PI) / 180) * dist;
                    const dy = Math.sin((angle * Math.PI) / 180) * dist - 40;
                    const colors = ["var(--blue)", "#ffffff", "#E3A83B"];
                    const vars: ConfettiVars = { "--dx": `${dx}px`, "--dy": `${dy}px`, "--rot": `${Math.round(Math.random() * 360)}deg`, background: colors[i % colors.length] };
                    return <span key={i} className="spin-confetti-piece" style={{ ...vars, animationDelay: `${Math.random() * 0.15}s` }} />;
                  })}
                </div>
              )}
            </div>

            <button type="button" ref={spinBtnRef} className="btn btn-primary spin-btn" disabled={!canSpin} onClick={spin}>
              <Icon name="casino" style={{ fontSize: 18 }} />
              {spinning ? t("dash.spin.spinning") : availableSpins === 0 ? t("dash.spin.noSpins.title") : t("dash.spin.spinBtn")}
              {!spinning && availableSpins > 0 && <Icon name="arrow_forward" style={{ fontSize: 16 }} />}
            </button>

            <div className="spin-availability">
              <Icon name="toll" />
              <span className="spin-availability-num">{availableSpins}</span>
              <span className="spin-availability-label">{t("dash.spin.available")}</span>
            </div>
            <div className="spin-rule">{t("dash.spin.rule")}</div>

            {availableSpins === 0 && !spinning && (
              <div className="spin-empty-note">
                {t("dash.spin.noSpins.body")}{" "}
                <Link href="/dashboard/activities" className="spin-empty-cta">
                  {t("dash.spin.noSpins.cta")}
                  <Icon name="arrow_forward" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="spin-rail">
        <div className="card spin-rail-card">
          <div className="spin-rail-head">
            <div className="spin-rail-title">{t("dash.spin.historyTitle")}</div>
          </div>
          {history.length === 0 ? (
            <div className="spin-history-empty">
              <Icon name="card_giftcard" />
              <div className="spin-history-empty-title">{t("dash.spin.noHistory")}</div>
              <div className="spin-history-empty-sub">{t("dash.spin.noHistorySub")}</div>
            </div>
          ) : (
            <ul className="spin-history-list">
              {history.map((h) => (
                <li key={h.key}>
                  <span className="spin-history-icon">
                    <Icon name={h.icon} />
                  </span>
                  <span className="spin-history-text">
                    {t(h.labelKey)}
                    <span className="spin-history-time">{formatSpinTime(h.at, t)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card spin-rail-card">
          <div className="spin-rail-head">
            <div className="spin-rail-title">{t("dash.spin.howItWorks.title")}</div>
          </div>
          <ol className="spin-steps">
            <li>
              <span className="spin-step-badge">1</span>
              <div>
                <div className="spin-step-title">{t("dash.spin.howItWorks.step1.title")}</div>
                <div className="spin-step-desc">{t("dash.spin.howItWorks.step1.desc")}</div>
              </div>
            </li>
            <li>
              <span className="spin-step-badge">2</span>
              <div>
                <div className="spin-step-title">{t("dash.spin.howItWorks.step2.title")}</div>
                <div className="spin-step-desc">{t("dash.spin.howItWorks.step2.desc")}</div>
              </div>
            </li>
            <li>
              <span className="spin-step-badge">3</span>
              <div>
                <div className="spin-step-title">{t("dash.spin.howItWorks.step3.title")}</div>
                <div className="spin-step-desc">{t("dash.spin.howItWorks.step3.desc")}</div>
              </div>
            </li>
          </ol>
        </div>
      </div>

      <div className="spin-stats">
        <div className="card spin-stat-card">
          <div className="spin-stat-label">{t("dash.spin.stat.available.label")}</div>
          <div className="spin-stat-value">{availableSpins}</div>
          <div className="spin-stat-note">{t("dash.spin.stat.available.note")}</div>
        </div>
        <div className="card spin-stat-card">
          <div className="spin-stat-label">{t("dash.spin.stat.bestReward.label")}</div>
          <div className="spin-stat-value">{t(BEST_REWARD.labelKey)}</div>
          <div className="spin-stat-note">{t("dash.spin.stat.bestReward.note")}</div>
        </div>
        <div className="card spin-stat-card">
          <div className="spin-stat-label">{t("dash.spin.stat.wallet.label")}</div>
          <div className="spin-stat-value">
            ${walletBalance.toFixed(2)} / ${WALLET_MIN_WITHDRAW.toFixed(2)}
          </div>
          <div className="spin-stat-note">{t("dash.spin.stat.wallet.note", { min: WALLET_MIN_WITHDRAW.toFixed(0) })}</div>
          <button
            type="button"
            className={`btn ${walletBalance >= WALLET_MIN_WITHDRAW ? "btn-primary" : "btn-ghost"} spin-withdraw-btn`}
            disabled={walletBalance < WALLET_MIN_WITHDRAW}
            onClick={requestWithdrawal}
          >
            <Icon name="account_balance_wallet" style={{ fontSize: 15 }} />
            {t("dash.spin.wallet.withdraw")}
          </button>
        </div>
        <div className="card spin-stat-card">
          <div className="spin-stat-label">{t("dash.spin.stat.bonusSpins.label")}</div>
          <div className="spin-stat-value">{bonusSpins}</div>
          <div className="spin-stat-note">{t("dash.spin.stat.bonusSpins.note")}</div>
        </div>
      </div>

      {mounted &&
        result &&
        createPortal(
          <>
            <div className="modal-scrim spin-result-scrim show" onClick={closeResult} />
            <div className="modal spin-result-modal show" role="dialog" aria-modal="true" aria-label={isTryAgain ? t("dash.spin.result.titleTryAgain") : t("dash.spin.result.title")}>
              <div className="spin-result-emoji">{isTryAgain ? "😔" : "🎉"}</div>
              <h3 className="spin-result-title">{isTryAgain ? t("dash.spin.result.titleTryAgain") : t("dash.spin.result.title")}</h3>
              {!isTryAgain && <div className="spin-result-prize">{t(result.labelKey)}</div>}
              <p className="spin-result-detail">{isTryAgain ? t("dash.spin.result.detailTryAgain") : t("dash.spin.result.detail")}</p>
              <button type="button" ref={modalBtnRef} className="btn btn-primary" onClick={closeResult}>
                {t("dash.spin.result.continue")}
              </button>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
