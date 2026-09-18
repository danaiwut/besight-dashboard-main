"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { useCrm } from "../../../components/crm/CrmContext";
import { apiCall } from "../../../lib/crmApi";
import type { SpinPageData, SpinPrizeDto, SpinResultDto } from "../../../lib/spin";
import Icon from "../../../components/Icon";

const SPIN_MS = 5000; // must track the .spin-wheel transition-duration in dashboard.css
type ConfettiVars = CSSProperties & { "--dx": string; "--dy": string; "--rot": string };

function formatSpinTime(iso: string, t: (key: string) => string) {
  const d = new Date(iso);
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

  const [data, setData] = useState<SpinPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinPrizeDto | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiSeed, setConfettiSeed] = useState(0);
  const [mounted, setMounted] = useState(false);
  const spinTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confettiTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spinBtnRef = useRef<HTMLButtonElement>(null);
  const modalBtnRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const payload = await apiCall<SpinPageData & { ok: boolean }>("/api/me/spin/", "GET");
      setData(payload);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load; the async fetch sets state in its callback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // createPortal needs a real document.body, which only exists client-side.
    setMounted(true);
  }, [load]);

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

  const prizes = data?.prizes ?? [];
  const segAngle = prizes.length ? 360 / prizes.length : 360;
  const balance = data?.balance ?? 0;
  const cost = data?.settings.costPerSpin ?? 0;
  const spinsAvailable = data?.spinsAvailable ?? 0;
  const canSpin = Boolean(data?.settings.enabled) && cost > 0 && spinsAvailable > 0 && prizes.length > 1 && !spinning;

  function closeResult() {
    setResult(null);
    spinBtnRef.current?.focus();
  }

  function fireConfetti() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    setConfettiSeed((k) => k + 1);
    setShowConfetti(true);
    if (confettiTimeout.current) clearTimeout(confettiTimeout.current);
    confettiTimeout.current = setTimeout(() => setShowConfetti(false), 1400);
  }

  async function spin() {
    if (!canSpin) return;
    setSpinning(true);
    try {
      const outcome = await apiCall<{ prize: SpinPrizeDto; cost: number; balance: number; spinsAvailable: number }>("/api/me/spin/", "POST");
      const index = prizes.findIndex((prize) => prize.id === outcome.prize.id);
      const withinTurn = index >= 0 ? 360 - (index * segAngle + segAngle / 2) : Math.random() * 360;
      setRotation((cur) => cur - (cur % 360) + 6 * 360 + withinTurn);

      if (spinTimeout.current) clearTimeout(spinTimeout.current);
      spinTimeout.current = setTimeout(() => {
        setSpinning(false);
        setResult(outcome.prize);
        setData((cur) => {
          if (!cur) return cur;
          const entry: SpinResultDto = {
            id: Date.now(),
            prizeId: outcome.prize.id,
            prizeName: outcome.prize.name,
            prizeIcon: outcome.prize.icon,
            prizeImage: outcome.prize.image,
            cost: outcome.cost,
            status: "pending",
            spunAt: new Date().toISOString(),
            memberId: 0,
            memberName: "",
            memberCode: "",
          };
          return {
            ...cur,
            balance: outcome.balance,
            spent: cur.spent + outcome.cost,
            spinsAvailable: outcome.spinsAvailable,
            history: [entry, ...cur.history].slice(0, 12),
          };
        });
        fireConfetti();
        toast(t("dash.spin.resultToast", { prize: outcome.prize.name }));
      }, SPIN_MS);
    } catch (spinError) {
      setSpinning(false);
      toast(spinError instanceof Error ? spinError.message : t("dash.spin.noSpins"));
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <p className="modal-detail" style={{ textAlign: "left", margin: 0 }}>…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <p>{error || "ไม่พบข้อมูล"}</p>
        <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => void load()}>
          {t("common.retry")}
        </button>
      </div>
    );
  }

  const history = data.history;

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
              <div className="spin-wheel" style={{ transform: `rotate(${rotation}deg)`, visibility: prizes.length > 1 ? "visible" : "hidden" }} role="img" aria-label={t("dash.title.spinWheel")}>
                {prizes.map((prize, i) => {
                  const angle = i * segAngle + segAngle / 2;
                  const dark = i % 2 === 0;
                  return (
                    <div className="spin-wheel-seg" style={{ transform: `rotate(${angle}deg)` }} key={prize.id}>
                      <span className={`spin-wheel-seg-label${dark ? " on-blue" : ""}`} style={{ transform: `rotate(${-angle}deg)` }}>
                        {prize.image ? (
                          // eslint-disable-next-line @next/next/no-img-element -- admin-provided prize image
                          <img src={prize.image} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: "cover" }} />
                        ) : (
                          <Icon name={prize.icon} />
                        )}
                        <span>{prize.name}</span>
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

            <button type="button" ref={spinBtnRef} className="btn btn-primary spin-btn" disabled={!canSpin} onClick={() => void spin()}>
              <Icon name="casino" style={{ fontSize: 18 }} />
              {spinning ? t("dash.spin.spinning") : spinsAvailable === 0 ? t("dash.spin.noSpins.title") : t("dash.spin.spinBtn")}
              {!spinning && spinsAvailable > 0 && <Icon name="arrow_forward" style={{ fontSize: 16 }} />}
            </button>

            <div className="spin-availability">
              <Icon name="toll" />
              <span className="spin-availability-num">{spinsAvailable}</span>
              <span className="spin-availability-label">{t("dash.spin.available")}</span>
            </div>
            <div className="spin-rule">{t("dash.spin.rule", { cost })}</div>

            {spinsAvailable === 0 && !spinning && (
              <div className="spin-empty-note">
                {t("dash.spin.noSpins")}{" "}
                <Link href="/dashboard/activities" className="spin-empty-cta">
                  {t("dash.spin.noSpins.cta")}
                  <Icon name="arrow_forward" />
                </Link>
              </div>
            )}
            {!data.settings.enabled && <div className="spin-empty-note">{t("dash.spin.disabled")}</div>}
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
                <li key={h.id}>
                  <span className="spin-history-icon">
                    <Icon name={h.prizeIcon} />
                  </span>
                  <span className="spin-history-text">
                    {h.prizeName}
                    <span className="spin-history-time">{formatSpinTime(h.spunAt, t)}</span>
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
          <div className="spin-stat-label">{t("dash.spin.stat.bec.label")}</div>
          <div className="spin-stat-value">{balance.toFixed(2)}</div>
          <div className="spin-stat-note">{t("dash.spin.earnedSpent", { earned: data.earned.toFixed(2), spent: data.spent.toFixed(2) })}</div>
        </div>
        <div className="card spin-stat-card">
          <div className="spin-stat-label">{t("dash.spin.stat.available.label")}</div>
          <div className="spin-stat-value">{spinsAvailable}</div>
          <div className="spin-stat-note">{t("dash.spin.stat.available.note")}</div>
        </div>
        <div className="card spin-stat-card">
          <div className="spin-stat-label">{t("dash.spin.stat.cost.label")}</div>
          <div className="spin-stat-value">{cost.toFixed(2)}</div>
          <div className="spin-stat-note">{t("dash.spin.stat.cost.note")}</div>
        </div>
        <div className="card spin-stat-card">
          <div className="spin-stat-label">{t("dash.spin.stat.bestReward.label")}</div>
          <div className="spin-stat-value">{prizes[0]?.name ?? "—"}</div>
          <div className="spin-stat-note">{t("dash.spin.stat.bestReward.note")}</div>
        </div>
      </div>

      {mounted &&
        result &&
        createPortal(
          <>
            <div className="modal-scrim spin-result-scrim show" onClick={closeResult} />
            <div className="modal spin-result-modal show" role="dialog" aria-modal="true" aria-label={t("dash.spin.result.title")}>
              <div className="spin-result-emoji">🎉</div>
              <h3 className="spin-result-title">{t("dash.spin.result.title")}</h3>
              <div className="spin-result-prize">{result.name}</div>
              {result.valueNote && <p className="spin-result-detail">{result.valueNote}</p>}
              <p className="spin-result-detail">{t("dash.spin.result.detail")}</p>
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
