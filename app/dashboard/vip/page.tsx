"use client";

import { useState } from "react";
import { useCrm, PLAN_LABELS, telegramBadgeClass, telegramStatusLabelKey } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { useCustomerData } from "../../../components/dashboard/useCustomerData";

export default function DashboardVipPage() {
  const { t } = useLanguage();
  const { telegramAccess, toast } = useCrm();
  const { member } = useCustomerData();

  const [discordConnected, setDiscordConnected] = useState(Boolean(member.discordUsername));
  const [lineConnected, setLineConnected] = useState(Boolean(member.socialLinks?.line));

  const tg = telegramAccess.find((a) => a.memberId === member.id);

  function openTelegram() {
    toast(t("dash.vip.telegram.openToast"));
  }

  function connectDiscord() {
    setDiscordConnected(true);
    toast(t("dash.vip.discord.connectedToast"));
  }

  function openDiscord() {
    toast(t("dash.vip.discord.openToast"));
  }

  function connectLine() {
    setLineConnected(true);
    toast(t("dash.vip.line.connectedToast"));
  }

  function openLine() {
    toast(t("dash.vip.line.openToast"));
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

          {tg ? (
            <>
              <div className="vip-channel-meta">
                <span className={`badge ${telegramBadgeClass(tg.status)}`}>{t(telegramStatusLabelKey(tg.status))}</span>
                <span className="vip-channel-room">{tg.room}</span>
              </div>
              {tg.status === "active" ? (
                <button type="button" className="btn btn-primary vip-channel-btn" onClick={openTelegram}>
                  {t("dash.vip.telegram.open")}
                </button>
              ) : (
                <div className="vip-channel-note">{t("dash.vip.telegram.inactiveNote")}</div>
              )}
            </>
          ) : (
            <div className="vip-channel-note">{t("dash.vip.telegram.noneNote")}</div>
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

          {discordConnected ? (
            <>
              <div className="vip-channel-meta">
                <span className="badge active">{t("common.active")}</span>
                <span className="vip-channel-room">{member.discordUsername ?? member.name}</span>
              </div>
              <button type="button" className="btn btn-primary vip-channel-btn" onClick={openDiscord}>
                {t("dash.vip.discord.open")}
              </button>
            </>
          ) : (
            <>
              <div className="vip-channel-note">{t("dash.vip.discord.noneNote")}</div>
              <button type="button" className="btn btn-ghost vip-channel-btn" onClick={connectDiscord}>
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

          {lineConnected ? (
            <>
              <div className="vip-channel-meta">
                <span className="badge active">{t("common.active")}</span>
                <span className="vip-channel-room">{member.name}</span>
              </div>
              <button type="button" className="btn btn-primary vip-channel-btn" onClick={openLine}>
                {t("dash.vip.line.open")}
              </button>
            </>
          ) : (
            <>
              <div className="vip-channel-note">{t("dash.vip.line.noneNote")}</div>
              <button type="button" className="btn btn-ghost vip-channel-btn" onClick={connectLine}>
                {t("dash.vip.line.connect")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
