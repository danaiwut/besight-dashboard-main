"use client";

import { useEffect, useRef, useState } from "react";
import { useCrm, initials, ROLE_DESC, ROLES, type Admin } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import { apiCall } from "../../../lib/crmApi";
import { SettingsSkeleton } from "../../../components/crm/Skeletons";
import Icon from "../../../components/Icon";
import Drawer from "../../../components/crm/Drawer";
import AdminForm, { type AdminFormHandle } from "../../../components/crm/AdminForm";
import type { Lang } from "../../../lib/i18n";

function LanguageCard() {
  const { lang, setLang, t } = useLanguage();

  return (
    <div className="card" style={{ padding: 22, marginBottom: 22 }}>
      <div className="settings-head">
        <h3>{t("set.language")}</h3>
        <div className="desc" style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 2 }}>
          {t("set.languageDesc")}
        </div>
      </div>
      <div className="tabs" style={{ width: "fit-content" }}>
        {(["en", "th"] as Lang[]).map((l) => (
          <button key={l} className={`tab${lang === l ? " is-active" : ""}`} onClick={() => setLang(l)}>
            {l === "en" ? t("set.languageEnglish") : t("set.languageThai")}
          </button>
        ))}
      </div>
    </div>
  );
}

function TelegramSettingsCard() {
  const { settings, setSettings, toast, backendLive } = useCrm();
  const { t } = useLanguage();
  const [botToken, setBotToken] = useState(settings.telegramBotToken);
  const [roomId, setRoomId] = useState(settings.telegramPrivateRoomId);
  const [autoRemove, setAutoRemove] = useState(settings.telegramAutoRemove);

  // General settings hydrate from the backend after mount — adopt them.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBotToken(settings.telegramBotToken);
    setRoomId(settings.telegramPrivateRoomId);
    setAutoRemove(settings.telegramAutoRemove);
  }, [settings.telegramBotToken, settings.telegramPrivateRoomId, settings.telegramAutoRemove]);

  async function save() {
    const data = { telegramBotToken: botToken.trim(), telegramPrivateRoomId: roomId.trim(), telegramAutoRemove: autoRemove };
    if (!backendLive) {
      setSettings((cur) => ({ ...cur, ...data }));
      toast(t("set.toast.telegramSaved"));
      return;
    }
    try {
      const payload = await apiCall<{ settings: { telegramBotToken: string; telegramPrivateRoomId: string; telegramAutoRemove: boolean } }>(
        "/api/crm/settings/general/",
        "PUT",
        data,
      );
      setSettings((cur) => ({ ...cur, ...payload.settings }));
      toast(t("set.toast.telegramSaved"));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to save Telegram settings");
    }
  }

  return (
    <div className="card" style={{ padding: 22, marginBottom: 22 }}>
      <div className="settings-head">
        <h3>{t("set.telegram")}</h3>
        <div className="desc" style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 2 }}>
          {t("set.telegramDesc")}
        </div>
      </div>      <div className="form-grid2">
        <div className="field">
          <label>{t("set.botToken")}</label>
          <input className="input" type="password" value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder="123456:ABC-DEF…" autoComplete="off" />
        </div>
        <div className="field">
          <label>{t("set.privateRoomId")}</label>
          <input className="input" value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="-1001234567890" />
        </div>
      </div>
      <div className="set-row" style={{ borderBottom: "none", paddingBottom: 0 }}>
        <div>
          <div className="t">{t("set.enableAutoRemove")}</div>
          <div className="d">{t("set.enableAutoRemoveDesc")}</div>
        </div>
        <label className="switch">
          <input type="checkbox" checked={autoRemove} onChange={(e) => setAutoRemove(e.target.checked)} />
          <span className="track"></span>
        </label>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button
          className="btn btn-primary"
          onClick={() => void save()}
        >
          {t("set.saveTelegramSettings")}
        </button>
      </div>
    </div>
  );
}

function SocialInviteCard() {
  const { settings, setSettings, toast, backendLive } = useCrm();
  const { t } = useLanguage();
  const [telegram, setTelegram] = useState(settings.telegramInviteLink);
  const [discord, setDiscord] = useState(settings.discordInviteLink);
  const [line, setLine] = useState(settings.lineInviteLink);

  // General settings hydrate from the backend after mount — adopt them.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTelegram(settings.telegramInviteLink);
    setDiscord(settings.discordInviteLink);
    setLine(settings.lineInviteLink);
  }, [settings.telegramInviteLink, settings.discordInviteLink, settings.lineInviteLink]);

  async function save() {
    const data = { telegramInviteLink: telegram.trim(), discordInviteLink: discord.trim(), lineInviteLink: line.trim() };
    if (!backendLive) {
      setSettings((cur) => ({ ...cur, ...data }));
      toast(t("set.toast.telegramSaved"));
      return;
    }
    try {
      const payload = await apiCall<{ settings: typeof data }>("/api/crm/settings/general/", "PUT", data);
      setSettings((cur) => ({ ...cur, ...payload.settings }));
      toast(t("set.toast.telegramSaved"));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to save invite links");
    }
  }

  return (
    <div className="card" style={{ padding: 22, marginBottom: 22 }}>
      <div className="settings-head">
        <h3>{t("set.inviteLinks")}</h3>
        <div className="desc" style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 2 }}>
          {t("set.inviteLinksDesc")}
        </div>
      </div>
      <div className="field">
        <label>{t("set.telegramInvite")}</label>
        <input className="input" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="https://t.me/…" />
      </div>
      <div className="field">
        <label>{t("set.discordInvite")}</label>
        <input className="input" value={discord} onChange={(e) => setDiscord(e.target.value)} placeholder="https://discord.gg/…" />
      </div>
      <div className="field">
        <label>{t("set.lineInvite")}</label>
        <input className="input" value={line} onChange={(e) => setLine(e.target.value)} placeholder="https://line.me/…" />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button className="btn btn-primary" onClick={() => void save()}>
          {t("set.saveTelegramSettings")}
        </button>
      </div>
    </div>
  );
}


function TeamPermissions() {
  const { admins, setAdmins, toast, backendLive } = useCrm();
  const { t } = useLanguage();
  const [drawerOpen, setDrawerOpen] = useState<{ admin: Admin | null } | null>(null);
  const formRef = useRef<AdminFormHandle>(null);

  async function setRole(a: Admin, role: string) {
    if (!backendLive) {
      setAdmins((cur) => cur.map((x) => (x.id === a.id ? { ...x, role } : x)));
      toast(t("set.toast.adminSet", { name: a.name, role }));
      return;
    }
    try {
      const payload = await apiCall<{ admin: Admin }>(`/api/crm/admins/${a.id}/`, "PUT", { role });
      setAdmins((cur) => cur.map((x) => (x.id === a.id ? payload.admin : x)));
      toast(t("set.toast.adminSet", { name: a.name, role }));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to update admin");
    }
  }

  async function removeAdmin(a: Admin) {
    if (!backendLive) {
      setAdmins((cur) => cur.filter((x) => x.id !== a.id));
      toast(t("set.toast.adminRemoved", { name: a.name }));
      return;
    }
    try {
      await apiCall(`/api/crm/admins/${a.id}/`, "DELETE");
      setAdmins((cur) => cur.filter((x) => x.id !== a.id));
      toast(t("set.toast.adminRemoved", { name: a.name }));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to remove admin");
    }
  }

  return (
    <div className="card" style={{ padding: 22, marginBottom: 22 }}>
      <div className="settings-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h3>{t("set.teamPermissions")}</h3>
          <div className="desc" style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 2 }}>
            {t("set.teamPermissionsDesc")}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setDrawerOpen({ admin: null })}>
          <Icon name="person_add" />
          {t("set.addAdmin")}
        </button>
      </div>
      <div className="table-wrap" style={{ marginTop: 6 }}>
        <table className="data" style={{ minWidth: 620 }}>
          <thead>
            <tr>
              <th>{t("set.col.admin")}</th>
              <th>{t("set.col.role")}</th>
              <th>{t("set.col.permissions")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="cust">
                    <span className="avatar">{initials(a.name)}</span>
                    <div>
                      <div className="cn">
                        {a.name} {a.owner && <span className="you-tag">{t("set.you")}</span>}
                      </div>
                      <div className="ce">{a.email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  {a.owner ? (
                    <span className="role-pill owner">Owner</span>
                  ) : (
                    <select
                      className="input role-select"
                      value={a.role}
                      onChange={(e) => void setRole(a, e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="perm-cell">{ROLE_DESC[a.role] ?? ""}</td>
                <td className="row-actions">
                  {!a.owner && (
                    <button
                      className="kebab"
                      aria-label="Remove admin"
                      onClick={() => void removeAdmin(a)}
                    >
                      <Icon name="delete" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Drawer
        open={!!drawerOpen}
        title={drawerOpen?.admin ? t("set.drawer.edit") : t("set.drawer.add")}
        onClose={() => setDrawerOpen(null)}
        body={drawerOpen ? <AdminForm ref={formRef} admin={drawerOpen.admin} onDone={() => setDrawerOpen(null)} /> : null}
        foot={
          drawerOpen && (
            <>
              <button className="btn btn-ghost" onClick={() => setDrawerOpen(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={() => formRef.current?.save()}>
                {drawerOpen.admin ? t("common.saveChanges") : t("set.addAdmin")}
              </button>
            </>
          )
        }
      />
    </div>
  );
}

export default function CrmSettingsPage() {
  const { crmDataStatus } = useCrm();

  if (crmDataStatus === "loading") return <SettingsSkeleton />;

  return (
    <section className="panel is-active">
      <LanguageCard />
      <TelegramSettingsCard />
      <SocialInviteCard />
      <TeamPermissions />
    </section>
  );
}
