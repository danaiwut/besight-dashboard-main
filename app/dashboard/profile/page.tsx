"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useCrm, fmtDate, PLAN_LABELS } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { useCustomerData } from "../../../components/dashboard/useCustomerData";
import { useTheme } from "../../../components/dashboard/ThemeContext";
import { WORLD_COUNTRIES } from "../../../lib/countries";
import Avatar from "../../../components/Avatar";
import Icon from "../../../components/Icon";

const MAX_AVATAR_BYTES = 4 * 1024 * 1024;

type SocialProvider = "google" | "line" | "facebook";

const SOCIAL_PROVIDERS: { key: SocialProvider; label: string; icon: ReactNode }[] = [
  {
    key: "google",
    label: "Google",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#EA4335" d="M12 10.2v3.9h5.45c-.24 1.4-.96 2.6-2.05 3.4l3.3 2.56c1.93-1.78 3.04-4.4 3.04-7.51 0-.72-.06-1.42-.18-2.09H12z" />
        <path fill="#34A853" d="M6.6 14.28l-.74.57-2.62 2.04C4.92 19.84 8.2 22 12 22c2.7 0 4.96-.89 6.62-2.42l-3.3-2.56c-.9.6-2.04.96-3.32.96-2.55 0-4.72-1.72-5.49-4.04z" />
        <path fill="#4A90D9" d="M3.24 7.11A9.93 9.93 0 0 0 2 12c0 1.74.42 3.38 1.24 4.89l3.36-2.61A5.99 5.99 0 0 1 6.27 12c0-.65.11-1.28.31-1.86L3.24 7.11z" />
        <path fill="#FBBC05" d="M12 6.04c1.47 0 2.78.51 3.82 1.5l2.86-2.86C16.96 2.99 14.7 2 12 2 8.2 2 4.92 4.16 3.24 7.11l3.34 2.6C7.28 7.76 9.45 6.04 12 6.04z" />
      </svg>
    ),
  },
  {
    key: "line",
    label: "LINE",
    // eslint-disable-next-line @next/next/no-img-element -- static export, brand logo asset
    icon: <img src="/img/Social/LINE_logo.svg.webp" alt="LINE" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 6 }} />,
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#1877F2"
          d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
        />
      </svg>
    ),
  },
];

export default function DashboardProfilePage() {
  const { t, lang } = useLanguage();
  const { setMembers, toast } = useCrm();
  const { member } = useCustomerData();
  const { theme } = useTheme();
  const [name, setName] = useState(member.name);
  const [displayName, setDisplayName] = useState(member.displayName ?? "");
  const [phone, setPhone] = useState(member.phone);
  const [country, setCountry] = useState(member.country ?? "");
  const sortedCountries = useMemo(
    () => [...WORLD_COUNTRIES].sort((a, b) => (lang === "th" ? a.th.localeCompare(b.th, "th") : a.en.localeCompare(b.en))),
    [lang],
  );
  const [address, setAddress] = useState(member.address ?? "");
  const [tv, setTv] = useState(member.tv);
  const [editingTv, setEditingTv] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState(member.telegramUsername ?? "");
  const [editingTelegram, setEditingTelegram] = useState(false);
  const [discordUsername, setDiscordUsername] = useState(member.discordUsername ?? "");
  const [editingDiscord, setEditingDiscord] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(member.avatarUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const social = member.socialLinks ?? {};

  function toggleSocial(provider: SocialProvider) {
    const connected = !social[provider];
    setMembers((cur) =>
      cur.map((m) => (m.id === member.id ? { ...m, socialLinks: { ...m.socialLinks, [provider]: connected } } : m))
    );
    const label = SOCIAL_PROVIDERS.find((p) => p.key === provider)!.label;
    toast(t(connected ? "dash.profile.toast.socialConnected" : "dash.profile.toast.socialDisconnected", { provider: label }));
  }

  function confirmTv() {
    const trimmed = tv.trim();
    setTv(trimmed);
    setMembers((cur) => cur.map((m) => (m.id === member.id ? { ...m, tv: trimmed } : m)));
    setEditingTv(false);
    toast(t("dash.profile.toast.saved"));
  }

  function confirmTelegram() {
    const trimmed = telegramUsername.trim();
    setTelegramUsername(trimmed);
    setMembers((cur) => cur.map((m) => (m.id === member.id ? { ...m, telegramUsername: trimmed || undefined } : m)));
    setEditingTelegram(false);
    toast(t("dash.profile.toast.saved"));
  }

  function confirmDiscord() {
    const trimmed = discordUsername.trim();
    setDiscordUsername(trimmed);
    setMembers((cur) => cur.map((m) => (m.id === member.id ? { ...m, discordUsername: trimmed || undefined } : m)));
    setEditingDiscord(false);
    toast(t("dash.profile.toast.saved"));
  }

  function pickAvatar() {
    fileInputRef.current?.click();
  }

  function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      toast(t("dash.profile.avatar.tooLarge"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  function save() {
    setMembers((cur) =>
      cur.map((m) =>
        m.id === member.id
          ? { ...m, name: name.trim() || m.name, displayName: displayName.trim() || undefined, phone, country, address, tv: tv.trim(), avatarUrl }
          : m
      )
    );
    toast(t("dash.profile.toast.saved"));
  }

  return (
    <div className="profile-grid profile-page-grid">
    <div className="card" style={{ padding: 24 }}>
      <div className="panel-section-title">{t("dash.profile.section.personal")}</div>

      <div className="profile-avatar-row">
        <div className="profile-avatar-wrap">
          <Avatar member={{ ...member, name, avatarUrl }} size={84} className="profile-avatar-big" />
          <button type="button" className="profile-avatar-edit" onClick={pickAvatar} aria-label={t("dash.profile.avatar.change")}>
            <Icon name="photo_camera" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onAvatarChange} />
        </div>
        <div>
          <button type="button" className="btn btn-ghost profile-avatar-btn" onClick={pickAvatar}>
            {t("dash.profile.avatar.change")}
          </button>
          <div className="profile-avatar-hint">{t("dash.profile.avatar.hint")}</div>
        </div>
      </div>

      <div className="form-grid2">
        <div className="field">
          <label>{t("dash.profile.field.name")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>{t("dash.profile.field.displayName")}</label>
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={name} />
          <div className="field-hint">{t("dash.profile.field.displayNameHint")}</div>
        </div>
        <div className="field">
          <label>{t("dash.profile.field.email")}</label>
          <input className="input" value={member.email} disabled style={{ opacity: 0.65 }} />
        </div>
        <div className="field">
          <label>{t("dash.profile.field.phone")}</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label>{t("dash.profile.field.country")}</label>
          <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">{t("dash.profile.field.countryPlaceholder")}</option>
            {sortedCountries.map((c) => (
              <option key={c.en} value={c.en}>
                {lang === "th" ? c.th : c.en}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t("dash.profile.field.address")}</label>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
      </div>

      <div className="drawer-row">
        <span className="k">{t("dash.profile.field.memberCode")}</span>
        <span className="v mono">{member.code}</span>
      </div>
      <div className="drawer-row">
        <span className="k">{t("dash.profile.field.joined")}</span>
        <span className="v">{fmtDate(member.joinedDate)}</span>
      </div>
      <div className="drawer-row">
        <span className="k">{t("dash.profile.field.plan")}</span>
        <span className="plan-pill">{PLAN_LABELS[member.plan]}</span>
      </div>

      <div style={{ marginTop: 24 }}>
        <button className="btn btn-primary" onClick={save}>
          {t("common.saveChanges")}
        </button>
      </div>
    </div>

    <div className="profile-col-side">
      <div className="card" style={{ padding: 24 }}>
        <div className="drawer-section" style={{ marginTop: 0 }}>
          <h4>{t("dash.profile.section.social")}</h4>
          {SOCIAL_PROVIDERS.map(({ key, label, icon }) => {
            const connected = !!social[key];
            return (
              <div className="drawer-row" key={key}>
                <span className="k social-link-name">
                  <span className="social-link-icon">{icon}</span>
                  {label}
                </span>
                <span className="v social-link-action">
                  {connected ? <span style={{ color: "var(--green)" }}>{t("dash.profile.social.connected")}</span> : t("dash.profile.notLinked")}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleSocial(key)}>
                    {connected ? t("dash.profile.social.disconnect") : t("dash.profile.social.connect")}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <div className="drawer-section" style={{ marginTop: 0 }}>
          <h4 className="drawer-section-title-icon">
            {/* eslint-disable-next-line @next/next/no-img-element -- static export, brand logo asset */}
            <img
              className="tradingview-logo"
              src={theme === "dark" ? "/img/tradingview/White/full-logo-white.svg" : "/img/tradingview/Black/full-logo-black.svg"}
              alt={t("dash.profile.section.tradingview")}
            />
          </h4>
          {editingTv ? (
            <div className="field">
              <label>{t("dash.profile.field.username")}</label>
              <div className="inline-edit-row">
                <input
                  className="input"
                  autoFocus
                  value={tv}
                  onChange={(e) => setTv(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmTv()}
                  placeholder={t("dash.profile.notLinked")}
                />
                <button type="button" className="btn btn-primary btn-sm" onClick={confirmTv} aria-label={t("common.confirm")}>
                  <Icon name="check" />
                  {t("common.confirm")}
                </button>
              </div>
            </div>
          ) : (
            <div className="drawer-row">
              <span className="k">{t("dash.profile.field.username")}</span>
              <span className="v social-link-action">
                <span className="social-link-value">{tv || t("dash.profile.notLinked")}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingTv(true)}>
                  <Icon name="edit" />
                  {t("common.edit")}
                </button>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <div className="drawer-section" style={{ marginTop: 0 }}>
          <h4 className="drawer-section-title-icon">
            <span className="social-link-icon">
              {/* eslint-disable-next-line @next/next/no-img-element -- static export, brand logo asset */}
              <img src="/img/Social/telegram-logo.svg" alt="" />
            </span>
            {t("dash.profile.section.telegram")}
          </h4>
          {editingTelegram ? (
            <div className="field">
              <label>{t("dash.profile.field.username")}</label>
              <div className="inline-edit-row">
                <input
                  className="input"
                  autoFocus
                  value={telegramUsername}
                  onChange={(e) => setTelegramUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmTelegram()}
                  placeholder={t("dash.profile.notLinked")}
                />
                <button type="button" className="btn btn-primary btn-sm" onClick={confirmTelegram} aria-label={t("common.confirm")}>
                  <Icon name="check" />
                  {t("common.confirm")}
                </button>
              </div>
            </div>
          ) : (
            <div className="drawer-row">
              <span className="k">{t("dash.profile.field.username")}</span>
              <span className="v social-link-action">
                <span className="social-link-value">{telegramUsername || t("dash.profile.notLinked")}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingTelegram(true)}>
                  <Icon name="edit" />
                  {t("common.edit")}
                </button>
              </span>
            </div>
          )}
        </div>

        <div className="drawer-section">
          <h4 className="drawer-section-title-icon">
            <span className="social-link-icon">
              {/* eslint-disable-next-line @next/next/no-img-element -- static export, brand logo asset */}
              <img src="/img/Social/discoard-logo.svg" alt="" />
            </span>
            {t("dash.profile.section.discord")}
          </h4>
          {editingDiscord ? (
            <div className="field">
              <label>{t("dash.profile.field.username")}</label>
              <div className="inline-edit-row">
                <input
                  className="input"
                  autoFocus
                  value={discordUsername}
                  onChange={(e) => setDiscordUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmDiscord()}
                  placeholder={t("dash.profile.notLinked")}
                />
                <button type="button" className="btn btn-primary btn-sm" onClick={confirmDiscord} aria-label={t("common.confirm")}>
                  <Icon name="check" />
                  {t("common.confirm")}
                </button>
              </div>
            </div>
          ) : (
            <div className="drawer-row">
              <span className="k">{t("dash.profile.field.username")}</span>
              <span className="v social-link-action">
                <span className="social-link-value">{discordUsername || t("dash.profile.notLinked")}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingDiscord(true)}>
                  <Icon name="edit" />
                  {t("common.edit")}
                </button>
              </span>
            </div>
          )}
        </div>

        <div className="drawer-section">
          <h4 className="drawer-section-title-icon">
            <span className="social-link-icon">
              {/* eslint-disable-next-line @next/next/no-img-element -- static export, brand logo asset */}
              <img src="/img/Social/LINE_logo.svg.webp" alt="" />
            </span>
            {t("dash.profile.section.line")}
          </h4>
          <div className="drawer-row">
            <span className="k">{t("dash.profile.field.username")}</span>
            <span className="v social-link-action">
              {social.line ? <span style={{ color: "var(--green)" }}>{t("dash.profile.social.connected")}</span> : t("dash.profile.notLinked")}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleSocial("line")}>
                {social.line ? t("dash.profile.social.disconnect") : t("dash.profile.social.connect")}
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
