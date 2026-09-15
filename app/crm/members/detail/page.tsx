"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCrm,
  accessLabel,
  accessBadgeClass,
  accessLabelKey,
  telegramStatusLabelKey,
  primaryIndicatorAccess,
  memberLots,
  requiredLotsFor,
  customerStage,
  customerStageBadgeClass,
  progressTone,
  initials,
  fmtDate,
  lot,
  PLAN_LABELS,
} from "../../../../components/crm/CrmContext";
import { useLanguage } from "../../../../components/crm/LanguageContext";
import Icon from "../../../../components/Icon";
import Drawer from "../../../../components/crm/Drawer";
import MemberForm from "../../../../components/crm/MemberForm";
import SuspendAccessModal from "../../../../components/crm/SuspendAccessModal";
import LotOverrideCard from "../../../../components/crm/LotOverrideCard";
import MemberIndicatorAccessPanel from "../../../../components/crm/MemberIndicatorAccessPanel";
import MemberTradeAccountsCard from "../../../../components/crm/MemberTradeAccountsCard";

function MemberDetailContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { members, setMembers, tradeAccounts, tradeLogs, indicatorAccess, setIndicatorAccess, telegramAccess, settings, toast, log } = useCrm();
  const { t } = useLanguage();
  const [editOpen, setEditOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const formRef = useRef<{ save: () => void }>(null);

  const id = Number(params.get("id"));
  const member = members.find((m) => m.id === id);

  if (!member) {
    return (
      <section className="panel is-active">
        <div className="card" style={{ padding: 24 }}>
          <p className="modal-detail" style={{ textAlign: "left", margin: "0 0 16px" }}>
            {t("members.detail.notFound")}
          </p>
          <Link href="/crm/members/" className="btn btn-ghost">
            <Icon name="arrow_back" />
            {t("members.detail.back")}
          </Link>
        </div>
      </section>
    );
  }

  const access = primaryIndicatorAccess(member.id, indicatorAccess);
  const label = accessLabel(access, settings);
  const telegram = telegramAccess.find((tg) => tg.memberId === member.id);
  const stage = customerStage(member, indicatorAccess);
  const lots = memberLots(member, tradeAccounts, tradeLogs, settings);
  const required = requiredLotsFor(member, settings);
  const tone = progressTone(lots, required);
  const pct = Math.min(100, required > 0 ? (lots / required) * 100 : 100);

  function handleSuspend(reasons: string[], note: string) {
    setIndicatorAccess((cur) => cur.map((a) => (a.memberId === member!.id ? { ...a, status: "suspended" } : a)));
    log({
      actor: "Alex Dean",
      memberId: member!.id,
      memberName: member!.name,
      action: "Manual Admin Override",
      description: `Indicator access suspended.${reasons.length ? ` Reason: ${reasons.join(", ")}.` : ""}${note ? ` "${note}"` : ""}`,
    });
    toast(t("members.toast.suspended", { name: member!.name }));
    setSuspendOpen(false);
  }

  function handleDelete() {
    setMembers((cur) => cur.filter((x) => x.id !== member!.id));
    toast(t("members.toast.deleted", { name: member!.name }));
    router.push("/crm/members/");
  }

  return (
    <section className="panel is-active">
      <Link href="/crm/members/" className="btn btn-ghost" style={{ marginBottom: 16 }}>
        <Icon name="arrow_back" />
        {t("members.detail.back")}
      </Link>

      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div className="drawer-profile" style={{ marginBottom: 0 }}>
            <span className="avatar">{initials(member.name)}</span>
            <div>
              <div className="dn">
                {member.name}{" "}
                <span className={`badge ${customerStageBadgeClass(stage)}`} style={{ marginLeft: 4 }}>
                  {t(`members.stage.${stage}`)}
                </span>
              </div>
              <div className="de">{member.email}</div>
              <span className={`plan-pill ${member.plan === "ib_partner" ? "elite" : "free"}`} style={{ marginTop: 8, display: "inline-flex" }}>
                {PLAN_LABELS[member.plan]}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" onClick={() => setEditOpen(true)}>
              <Icon name="edit" />
              {t("common.edit")}
            </button>
            {access?.status !== "suspended" && (
              <button className="btn btn-danger" onClick={() => setSuspendOpen(true)}>
                {t("members.suspendAccess")}
              </button>
            )}
            <button className="btn btn-danger" aria-label="Delete" onClick={handleDelete}>
              <Icon name="delete" />
            </button>
          </div>
        </div>
      </div>

      <div className="form-grid2" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="panel-section-title">{t("members.section.personal")}</div>
          <div className="drawer-row">
            <span className="k">{t("members.field.memberId")}</span>
            <span className="v mono">{member.code}</span>
          </div>
          <div className="drawer-row">
            <span className="k">{t("members.field.phone")}</span>
            <span className="v">{member.phone || "—"}</span>
          </div>
          <div className="drawer-row">
            <span className="k">{t("members.field.country")}</span>
            <span className="v">{member.country || "—"}</span>
          </div>
          <div className="drawer-row">
            <span className="k">{t("members.field.created")}</span>
            <span className="v">{fmtDate(member.createdDate)}</span>
          </div>
          <div className="drawer-row" style={{ borderBottom: "none" }}>
            <span className="k">{t("members.section.tradingview")}</span>
            <span className="v mono">{member.tv || "—"}</span>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="panel-section-title">{t("members.section.telegram")}</div>
          <div className="drawer-row">
            <span className="k">{t("members.field.username")}</span>
            <span className="v mono">{member.telegramUsername || "—"}</span>
          </div>
          <div className="drawer-row">
            <span className="k">{t("members.field.userId")}</span>
            <span className="v mono">{member.telegramUserId || "—"}</span>
          </div>
          <div className="drawer-row" style={{ borderBottom: "none" }}>
            <span className="k">{t("members.col.accessStatus")}</span>
            <span className="v">{telegram ? <span className={`badge ${telegram.status}`}>{t(telegramStatusLabelKey(telegram.status))}</span> : "—"}</span>
          </div>
        </div>
      </div>

      <div className="form-grid2" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="panel-section-title">{t("lm.col.progress")}</div>
          <div className={`lot-progress ${tone}`}>
            <div className="lp-track">
              <span className="lp-fill" style={{ width: `${pct}%` }}></span>
            </div>
            <span className="lp-label">{t("lm.lotsLabel", { lots: lot(lots), required: lot(required) })}</span>
          </div>
          <div style={{ marginTop: 4 }}>
            <span className={`badge ${accessBadgeClass(label)}`}>{t(accessLabelKey(label))}</span>
          </div>
          <div style={{ marginTop: 16 }}>
            <LotOverrideCard member={member} />
          </div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <MemberIndicatorAccessPanel member={member} />
        </div>
      </div>

      <MemberTradeAccountsCard member={member} />

      <Drawer
        open={editOpen}
        title={t("members.drawer.edit")}
        onClose={() => setEditOpen(false)}
        body={<MemberForm ref={formRef} member={member} onDone={() => setEditOpen(false)} />}
        foot={
          <>
            <button className="btn btn-ghost" onClick={() => setEditOpen(false)}>
              {t("common.cancel")}
            </button>
            <button className="btn btn-primary" onClick={() => formRef.current?.save()}>
              {t("common.saveChanges")}
            </button>
          </>
        }
      />

      {suspendOpen && <SuspendAccessModal member={member} onConfirm={handleSuspend} onClose={() => setSuspendOpen(false)} />}
    </section>
  );
}

export default function MemberDetailPage() {
  return (
    <Suspense fallback={null}>
      <MemberDetailContent />
    </Suspense>
  );
}
