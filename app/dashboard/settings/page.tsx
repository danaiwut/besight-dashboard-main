"use client";

import { useRef, useState } from "react";
import { useCrm } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { useTheme } from "../../../components/dashboard/ThemeContext";
import { useCustomerData } from "../../../components/dashboard/useCustomerData";
import Icon from "../../../components/Icon";
import LeaderboardProfileCard from "../../../components/dashboard/LeaderboardProfileCard";

const MAX_BG_BYTES = 6 * 1024 * 1024;

function BgUploadRow({
  label,
  currentUrl,
  defaultAsset,
  onUpload,
  onReset,
}: {
  label: string;
  currentUrl: string | null;
  defaultAsset: string;
  onUpload: (dataUrl: string) => void;
  onReset: () => void;
}) {
  const { t } = useLanguage();
  const { toast } = useCrm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    if (file.size > MAX_BG_BYTES) {
      toast(t("dash.settings.preferences.bgTooLarge"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onUpload(reader.result as string);
      toast(t("dash.settings.preferences.bgUploaded"));
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="bg-upload-row">
      <span className="bg-upload-label">{label}</span>
      <div className="bg-upload-preview" style={{ backgroundImage: `url("${currentUrl ?? defaultAsset}")` }} />
      <div className="bg-upload-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileInputRef.current?.click()}>
          <Icon name="upload" />
          {t("dash.settings.preferences.bgChange")}
        </button>
        {currentUrl && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>
            {t("dash.settings.preferences.bgReset")}
          </button>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFileChange} />
    </div>
  );
}

export default function DashboardSettingsPage() {
  const { t, lang, setLang } = useLanguage();
  const { theme, setTheme, lightBgUrl, setLightBgUrl, darkBgUrl, setDarkBgUrl } = useTheme();
  const { toast } = useCrm();
  const { member } = useCustomerData();

  const [notifyRebate, setNotifyRebate] = useState(true);
  const [notifyRenewal, setNotifyRenewal] = useState(true);
  const [notifyPromo, setNotifyPromo] = useState(false);
  const [notifyTelegram, setNotifyTelegram] = useState(Boolean(member.telegramUsername));

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function notify(setter: (v: boolean) => void, checked: boolean) {
    setter(checked);
    toast(t("dash.settings.notifications.saved"));
  }

  function changePassword() {
    if (!currentPassword || !newPassword) {
      toast(t("dash.settings.security.missingFields"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast(t("dash.settings.security.mismatch"));
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast(t("dash.settings.security.changed"));
  }

  return (
    <div>
      <div className="card" style={{ padding: 24 }}>
        <div className="panel-section-title">{t("dash.settings.section.preferences")}</div>
        <div className="drawer-row">
          <span className="k">{t("dash.settings.preferences.language")}</span>
          <div className="comp-tabs" style={{ margin: 0, border: "none" }}>
            <button type="button" className={`comp-tab${lang === "en" ? " is-active" : ""}`} onClick={() => setLang("en")}>
              English
            </button>
            <button type="button" className={`comp-tab${lang === "th" ? " is-active" : ""}`} onClick={() => setLang("th")}>
              ไทย
            </button>
          </div>
        </div>
        <div className="drawer-row">
          <span className="k">{t("dash.settings.preferences.theme")}</span>
          <button
            type="button"
            className="theme-switch"
            role="switch"
            aria-checked={theme === "dark"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Icon name="light_mode" className="theme-switch-icon sun" />
            <Icon name="dark_mode" className="theme-switch-icon moon" />
            <span className="theme-switch-knob">
              <Icon name={theme === "dark" ? "dark_mode" : "light_mode"} />
            </span>
          </button>
        </div>
        <BgUploadRow
          label={t("dash.settings.preferences.lightBg")}
          currentUrl={lightBgUrl}
          defaultAsset="/img/dashboard-white-bg.jpg"
          onUpload={setLightBgUrl}
          onReset={() => setLightBgUrl(null)}
        />
        <BgUploadRow
          label={t("dash.settings.preferences.darkBg")}
          currentUrl={darkBgUrl}
          defaultAsset="/img/dashboard-black-bg.jpg"
          onUpload={setDarkBgUrl}
          onReset={() => setDarkBgUrl(null)}
        />
      </div>

      <LeaderboardProfileCard />

      <div className="card" style={{ padding: 24, marginTop: 20 }}>
        <div className="panel-section-title">{t("dash.settings.section.notifications")}</div>
        <div className="set-row">
          <div>
            <div className="t">{t("dash.settings.notif.rebate")}</div>
            <div className="d">{t("dash.settings.notif.rebateDesc")}</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={notifyRebate} onChange={(e) => notify(setNotifyRebate, e.target.checked)} />
            <span className="track"></span>
          </label>
        </div>
        <div className="set-row">
          <div>
            <div className="t">{t("dash.settings.notif.renewal")}</div>
            <div className="d">{t("dash.settings.notif.renewalDesc")}</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={notifyRenewal} onChange={(e) => notify(setNotifyRenewal, e.target.checked)} />
            <span className="track"></span>
          </label>
        </div>
        <div className="set-row">
          <div>
            <div className="t">{t("dash.settings.notif.telegram")}</div>
            <div className="d">{t("dash.settings.notif.telegramDesc")}</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={notifyTelegram} onChange={(e) => notify(setNotifyTelegram, e.target.checked)} />
            <span className="track"></span>
          </label>
        </div>
        <div className="set-row">
          <div>
            <div className="t">{t("dash.settings.notif.promo")}</div>
            <div className="d">{t("dash.settings.notif.promoDesc")}</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={notifyPromo} onChange={(e) => notify(setNotifyPromo, e.target.checked)} />
            <span className="track"></span>
          </label>
        </div>
      </div>

      <div className="card" style={{ padding: 24, marginTop: 20 }}>
        <div className="panel-section-title">{t("dash.settings.section.security")}</div>
        <div className="form-grid2">
          <div className="field">
            <label>{t("dash.settings.security.current")}</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="field" />
          <div className="field">
            <label>{t("dash.settings.security.new")}</label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label>{t("dash.settings.security.confirm")}</label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-primary" onClick={changePassword}>
            {t("dash.settings.security.changeBtn")}
          </button>
        </div>

        <div className="set-row" style={{ marginTop: 8 }}>
          <div>
            <div className="t">{t("dash.settings.security.twoFactor")}</div>
            <div className="d">{t("dash.settings.security.twoFactorDesc")}</div>
          </div>
          <span className="badge pending">{t("dash.settings.comingSoon")}</span>
        </div>
      </div>

      <div className="card" style={{ padding: 24, marginTop: 20, borderColor: "var(--red)" }}>
        <div className="panel-section-title" style={{ color: "var(--red)" }}>
          {t("dash.settings.section.danger")}
        </div>
        <div className="set-row">
          <div>
            <div className="t">{t("dash.settings.danger.deactivate")}</div>
            <div className="d">{t("dash.settings.danger.deactivateDesc")}</div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: "var(--red)", borderColor: "var(--red)" }}
            onClick={() => toast(t("dash.settings.danger.toast"))}
          >
            {t("dash.settings.danger.deactivateBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
