"use client";

import { useRef, useState } from "react";
import { useCrm, initials, fmtDate, backfillRebateData, ROLE_DESC, ROLES, type Admin } from "../../../components/crm/CrmContext";
import { useLanguage } from "../../../components/crm/LanguageContext";
import Icon from "../../../components/Icon";
import Drawer from "../../../components/crm/Drawer";
import AdminForm, { type AdminFormHandle } from "../../../components/crm/AdminForm";
import DateRangePicker, { type DateRange } from "../../../components/crm/DateRangePicker";
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
  const { settings, setSettings, toast } = useCrm();
  const { t } = useLanguage();
  const [botToken, setBotToken] = useState(settings.telegramBotToken);
  const [roomId, setRoomId] = useState(settings.telegramPrivateRoomId);
  const [autoRemove, setAutoRemove] = useState(settings.telegramAutoRemove);

  return (
    <div className="card" style={{ padding: 22, marginBottom: 22 }}>
      <div className="settings-head">
        <h3>{t("set.telegram")}</h3>
        <div className="desc" style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 2 }}>
          {t("set.telegramDesc")}
        </div>
      </div>
      <div className="form-grid2">
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
          onClick={() => {
            setSettings((cur) => ({ ...cur, telegramBotToken: botToken.trim(), telegramPrivateRoomId: roomId.trim(), telegramAutoRemove: autoRemove }));
            toast(t("set.toast.telegramSaved"));
          }}
        >
          {t("set.saveTelegramSettings")}
        </button>
      </div>
    </div>
  );
}

function RebateBackfillCard() {
  const { brokers, tradeAccounts, tradeLogs, setTradeLogs, setTradeAccounts, log, toast } = useCrm();
  const { t } = useLanguage();
  const [brokerId, setBrokerId] = useState(brokers[0]?.id ?? 0);
  const [tradeId, setTradeId] = useState("");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [lastResult, setLastResult] = useState<{ broker: string; tradeId: string; from: string; to: string; lots: number; rebate: number; n: number } | null>(null);

  function pull() {
    const trimmedTradeId = tradeId.trim();
    if (!trimmedTradeId) {
      toast(t("set.toast.rebateBackfillTradeIdRequired"));
      return;
    }
    if (!range.from || !range.to) {
      toast(t("set.toast.rebateBackfillRangeRequired"));
      return;
    }
    const broker = brokers.find((b) => b.id === brokerId);
    const brokerName = broker?.name ?? "";
    const account = tradeAccounts.find((a) => a.brokerId === brokerId && a.tradeId === trimmedTradeId);
    if (!account) {
      toast(t("set.toast.rebateBackfillAccountNotFound", { broker: brokerName, tradeId: trimmedTradeId }));
      return;
    }
    const startId = Math.max(0, ...tradeLogs.map((l) => l.id)) + 1;
    const result = backfillRebateData([account], range.from, range.to, tradeLogs, startId);

    if (!result.newLogs.length) {
      toast(t("set.toast.rebateBackfillNone", { broker: brokerName, tradeId: trimmedTradeId }));
      return;
    }

    setTradeLogs((cur) => [...cur, ...result.newLogs]);
    const today = new Date().toISOString().slice(0, 10);
    setTradeAccounts((cur) => cur.map((a) => (a.id === account.id ? { ...a, lastSync: today } : a)));

    const n = result.newLogs.length;
    log({
      actor: "Alex Dean",
      memberId: account.memberId,
      action: "Rebate Backfill",
      description: `Backfilled ${brokerName} · ${trimmedTradeId} rebate data for ${fmtDate(range.from)} – ${fmtDate(range.to)}: +${result.totalLots} lots / $${result.totalRebate.toFixed(2)} across ${n} day(s).`,
    });

    setLastResult({ broker: brokerName, tradeId: trimmedTradeId, from: range.from, to: range.to, lots: result.totalLots, rebate: result.totalRebate, n });
    toast(t("set.toast.rebateBackfillFilled", { broker: brokerName, tradeId: trimmedTradeId, lots: result.totalLots, rebate: result.totalRebate.toFixed(2), n }));
  }

  return (
    <div className="card" style={{ padding: 22, marginBottom: 22 }}>
      <div className="settings-head">
        <h3>{t("set.rebateBackfill")}</h3>
        <div className="desc" style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 2 }}>
          {t("set.rebateBackfillDesc")}
        </div>
      </div>
      <div className="form-grid3">
        <div className="field">
          <label>{t("set.rebateBackfill.broker")}</label>
          <select className="input" value={brokerId} onChange={(e) => setBrokerId(Number(e.target.value))}>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t("set.rebateBackfill.tradeId")}</label>
          <input className="input" value={tradeId} onChange={(e) => setTradeId(e.target.value)} placeholder={t("set.rebateBackfill.tradeIdPlaceholder")} />
        </div>
        <div className="field">
          <label>{t("set.rebateBackfill.dateRange")}</label>
          <DateRangePicker value={range} onChange={setRange} placeholder={t("set.rebateBackfill.selectRange")} />
        </div>
      </div>
      {lastResult && (
        <div style={{ fontSize: 12.5, color: "var(--text-sub)", marginBottom: 16 }}>
          {t("set.rebateBackfill.lastResult", {
            broker: lastResult.broker,
            tradeId: lastResult.tradeId,
            from: fmtDate(lastResult.from),
            to: fmtDate(lastResult.to),
            lots: lastResult.lots,
            rebate: lastResult.rebate.toFixed(2),
            n: lastResult.n,
          })}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={pull}>
          <Icon name="cloud_download" />
          {t("set.rebateBackfill.pull")}
        </button>
      </div>
    </div>
  );
}

function TeamPermissions() {
  const { admins, setAdmins, toast } = useCrm();
  const { t } = useLanguage();
  const [drawerOpen, setDrawerOpen] = useState<{ admin: Admin | null } | null>(null);
  const formRef = useRef<AdminFormHandle>(null);

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
                      onChange={(e) => {
                        const role = e.target.value;
                        setAdmins((cur) => cur.map((x) => (x.id === a.id ? { ...x, role } : x)));
                        toast(t("set.toast.adminSet", { name: a.name, role }));
                      }}
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
                      onClick={() => {
                        setAdmins((cur) => cur.filter((x) => x.id !== a.id));
                        toast(t("set.toast.adminRemoved", { name: a.name }));
                      }}
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
  const { t } = useLanguage();
  return (
    <section className="panel is-active">
      <LanguageCard />

      <div className="card" style={{ padding: 22, marginBottom: 22 }}>
        <div className="settings-head">
          <h3>{t("set.adminProfile")}</h3>
        </div>
        <div className="form-grid2">
          <div className="field">
            <label>{t("set.fullName")}</label>
            <input className="input" defaultValue="Alex Dean" />
          </div>
          <div className="field">
            <label>{t("set.email")}</label>
            <input className="input" type="email" defaultValue="alex.dean@besight.com" />
          </div>
          <div className="field">
            <label>{t("set.role")}</label>
            <input className="input" defaultValue="Administrator" disabled />
          </div>
          <div className="field">
            <label>{t("set.timezone")}</label>
            <input className="input" defaultValue="GMT-5 (Eastern)" />
          </div>
        </div>
      </div>

      <TelegramSettingsCard />
      <RebateBackfillCard />
      <TeamPermissions />

      <div className="card" style={{ padding: 22 }}>
        <div className="settings-head">
          <h3>{t("set.notifications")}</h3>
        </div>
        <div className="set-row">
          <div>
            <div className="t">{t("set.notif.newMembers")}</div>
            <div className="d">{t("set.notif.newMembersDesc")}</div>
          </div>
          <label className="switch">
            <input type="checkbox" defaultChecked />
            <span className="track"></span>
          </label>
        </div>
        <div className="set-row">
          <div>
            <div className="t">{t("set.notif.lotAlerts")}</div>
            <div className="d">{t("set.notif.lotAlertsDesc")}</div>
          </div>
          <label className="switch">
            <input type="checkbox" defaultChecked />
            <span className="track"></span>
          </label>
        </div>
        <div className="set-row">
          <div>
            <div className="t">{t("set.notif.expiredAccess")}</div>
            <div className="d">{t("set.notif.expiredAccessDesc")}</div>
          </div>
          <label className="switch">
            <input type="checkbox" defaultChecked />
            <span className="track"></span>
          </label>
        </div>
      </div>
    </section>
  );
}
