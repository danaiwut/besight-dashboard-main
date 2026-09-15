"use client";

import { useState } from "react";
import { useCrm, lot, type Member } from "./CrmContext";
import { useLanguage } from "./LanguageContext";

export default function LotOverrideCard({ member }: { member: Member }) {
  const { setMembers, settings, toast, log } = useCrm();
  const { t } = useLanguage();
  const [overrideOn, setOverrideOn] = useState(member.requiredLotsOverride != null);
  const [overrideVal, setOverrideVal] = useState(member.requiredLotsOverride ?? settings.requiredLots);
  const [note, setNote] = useState(member.requiredLotsOverrideNote ?? "");

  function saveOverride() {
    const trimmedNote = note.trim();
    setMembers((cur) =>
      cur.map((m) =>
        m.id === member.id
          ? { ...m, requiredLotsOverride: overrideOn ? overrideVal : undefined, requiredLotsOverrideNote: overrideOn ? trimmedNote || undefined : undefined }
          : m
      )
    );
    log({
      actor: "Alex Dean",
      memberId: member.id,
      memberName: member.name,
      action: "Manual Admin Override",
      description: overrideOn
        ? `Required lots manually set to ${lot(overrideVal)} (default is ${lot(settings.requiredLots)}).${trimmedNote ? ` Reason: ${trimmedNote}.` : ""}`
        : `Custom lot requirement removed — reverted to default ${lot(settings.requiredLots)}.`,
    });
    toast(overrideOn ? t("lm.toast.overrideSaved", { name: member.name }) : t("lm.toast.overrideCleared", { name: member.name }));
  }

  return (
    <div className="drawer-section" style={{ marginTop: 0 }}>
      <h4>{t("lm.lotOverride")}</h4>
      <p className="ppr-hint">{t("lm.defaultRequired", { lots: lot(settings.requiredLots) })}</p>
      <label className="pop-toggle" style={{ marginTop: 0 }}>
        <input type="checkbox" checked={overrideOn} onChange={(e) => setOverrideOn(e.target.checked)} /> {t("lm.overrideToggle")}
      </label>
      {overrideOn && (
        <>
          <div className="field">
            <label>{t("lm.overrideLots")}</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              value={overrideVal}
              onChange={(e) => setOverrideVal(Math.max(0, parseFloat(e.target.value) || 0))}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t("lm.overrideNote")}</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("lm.overrideNotePlaceholder")} />
          </div>
        </>
      )}
      <button className="btn btn-primary" style={{ width: "100%", marginTop: 12 }} onClick={saveOverride}>
        {t("common.save")}
      </button>
    </div>
  );
}
