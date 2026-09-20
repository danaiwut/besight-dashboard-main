"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useCrm, PLAN_LABELS, telegramBadgeClass, telegramStatusLabelKey } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { useCustomerData } from "../../../components/dashboard/useCustomerData";
import { useSocialStatus } from "../../../components/dashboard/useSocialStatus";
import TelegramLoginButton from "../../../components/dashboard/TelegramLoginButton";

function openExternal(url: string | null, fallback: () => void) {
  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  fallback();
}

function VipContent() {
  const { toast } = useCrm();
  const { t } = useLanguage();
  const { member } = useCustomerData();
  const { telegramAccess } = useCrm();
  const { data: social, loading: socialLoading, unlink } = useSocialStatus();
  const router = useRouter();
  const params = useSearchParams();

  // OAuth round-trip result (?social=discord&linked=1 / &error=…).
  useEffect(() => {
    const provider = params.get("social");
    if (!provider) return;
    if (params.get("linked") === "1") toast(t("dash.vip.linked", { provider }));
    else if (params.get("error")) toast(t("dash.vip.linkFailed", { provider }));
    router.replace("/dashboard/vip/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tg = telegramAccess.find((a) => a.memberId === member.id);
  const tgLinked = social?.status.telegram;
  const dcLinked = social?.status.discord;
  const lineLinked = social?.status.line;
  const invites = social?.inviteLinks;

  async function disconnect(provider: "telegram" | "discord" | "line") {
    if (!window.confirm(t("dash.vip.disconnectConfirm", { provider }))) return;
    try {
      await unlink(provider);
      toast(t("dash.vip.disconnected", { provider }));
    } catch {
      toast(t("dash.vip.disconnectFailed"));
    }
  }

  function linkedBadge(username: string | null) {
    return (
      <>
        <span className="badge active">{t("common.active")}</span>
        <span className="vip-channel-room">{username ?? t("dash.vip.linkedNoName")}</span>
      </>
    );
  }

  return (
    <div>
      <div className="card vip-hero">
        <div className="vip-hero-copy">
          <div className="vip-hero-title">{t("dash.vip.hero.title")}</div>
          <div className="vip-hero-sub">{t("dash.vip.hero.sub")}</div>
        </div>
        <span className="plan-pill">
          {t("dash.profile.field.plan")}: {PLAN_LABELS[member.plan]}
        </span>
      </div>

      <div className="vip-channel-grid">
        <div className="card vip-channel-card">
          <div className="vip-channel-head">
            <span className="vip-channel-ic is-telegram">
              {/* eslint-disable-next-line @next/next/no-img-element -- static export, brand logo asset */}
              <img src="/img/Social/telegram-logo.svg" alt="Telegram" />
            </span>
            <div>
              <div className="vip-channel-title">{t("dash.vip.telegram.title")}</div>
              <div className="vip-channel-sub">{t("dash.vip.telegram.sub")}</div>
            </div>
          </div>

          {socialLoading ? (
            <div className="vip-channel-note">…</div>
          ) : tgLinked?.linked ? (
            <>
              <div className="vip-channel-meta">
                {linkedBadge(tgLinked.username)}
                {tg && (
                  <span className={`badge ${telegramBadgeClass(tg.status)}`} title={tg.room}>
                    {t(telegramStatusLabelKey(tg.status))}
                  </span>
                )}
              </div>
              {tg?.status === "active" ? (
                <button
                  type="button"
                  className="btn btn-primary vip-channel-btn"
                  onClick={() => openExternal(invites?.telegram ?? null, () => toast(t("dash.vip.noInvite")))}
                >
                  {t("dash.vip.telegram.open")}
                </button>
              ) : (
                <div className="vip-channel-note">{t("dash.vip.telegram.inactiveNote")}</div>
              )}
              <button type="button" className="btn btn-ghost vip-channel-btn" onClick={() => void disconnect("telegram")}>
                {t("dash.vip.disconnect")}
              </button>
            </>
          ) : social?.telegramBotUsername ? (
            <>
              <div className="vip-channel-note">{t("dash.vip.telegram.loginHint")}</div>
              <TelegramLoginButton
                botUsername={social.telegramBotUsername}
                onLinked={() => {
                  toast(t("dash.vip.linked", { provider: "Telegram" }));
                  window.location.reload();
                }}
              />
            </>
          ) : (
            <div className="vip-channel-note">{t("dash.vip.telegram.notConfigured")}</div>
          )}
        </div>

        <div className="card vip-channel-card">
          <div className="vip-channel-head">
            <span className="vip-channel-ic is-discord">
              {/* eslint-disable-next-line @next/next/no-img-element -- static export, brand logo asset */}
              <img src="/img/Social/discoard-logo.svg" alt="Discord" />
            </span>
            <div>
              <div className="vip-channel-title">{t("dash.vip.discord.title")}</div>
              <div className="vip-channel-sub">{t("dash.vip.discord.sub")}</div>
            </div>
          </div>

          {socialLoading ? (
            <div className="vip-channel-note">…</div>
          ) : dcLinked?.linked ? (
            <>
              <div className="vip-channel-meta">{linkedBadge(dcLinked.username)}</div>
              <button
                type="button"
                className="btn btn-primary vip-channel-btn"
                onClick={() => openExternal(invites?.discord ?? null, () => toast(t("dash.vip.noInvite")))}
              >
                {t("dash.vip.discord.open")}
              </button>
              <button type="button" className="btn btn-ghost vip-channel-btn" onClick={() => void disconnect("discord")}>
                {t("dash.vip.disconnect")}
              </button>
            </>
          ) : (
            <>
              <div className="vip-channel-note">{t("dash.vip.discord.loginHint")}</div>
              <button
                type="button"
                className="btn btn-ghost vip-channel-btn"
                onClick={() => { window.location.href = "/api/social/discord/start/"; }}
              >
                {t("dash.vip.discord.connect")}
              </button>
            </>
          )}
        </div>

        <div className="card vip-channel-card">
          <div className="vip-channel-head">
            <span className="vip-channel-ic is-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- static export, brand logo asset */}
              <img src="/img/Social/LINE_logo.svg.webp" alt="LINE" />
            </span>
            <div>
              <div className="vip-channel-title">{t("dash.vip.line.title")}</div>
              <div className="vip-channel-sub">{t("dash.vip.line.sub")}</div>
            </div>
          </div>

          {socialLoading ? (
            <div className="vip-channel-note">…</div>
          ) : lineLinked?.linked ? (
            <>
              <div className="vip-channel-meta">{linkedBadge(lineLinked.username)}</div>
              <button
                type="button"
                className="btn btn-primary vip-channel-btn"
                onClick={() => openExternal(invites?.line ?? null, () => toast(t("dash.vip.noInvite")))}
              >
                {t("dash.vip.line.open")}
              </button>
              <button type="button" className="btn btn-ghost vip-channel-btn" onClick={() => void disconnect("line")}>
                {t("dash.vip.disconnect")}
              </button>
            </>
          ) : (
            <>
              <div className="vip-channel-note">{t("dash.vip.line.loginHint")}</div>
              <button
                type="button"
                className="btn btn-ghost vip-channel-btn"
                onClick={() => { window.location.href = "/api/social/line/start/"; }}
              >
                {t("dash.vip.line.connect")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardVipPage() {
  return (
    <Suspense fallback={null}>
      <VipContent />
    </Suspense>
  );
}
