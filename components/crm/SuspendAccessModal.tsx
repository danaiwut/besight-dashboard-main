"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { SUSPEND_REASON_LABELS, type Member } from "./CrmContext";
import { useLanguage } from "./LanguageContext";
import Icon from "../Icon";

const REASON_KEYS = Object.keys(SUSPEND_REASON_LABELS);

export default function SuspendAccessModal({
  member,
  onConfirm,
  onClose,
}: {
  member: Member;
  onConfirm: (reasons: string[], note: string) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");

  function toggle(key: string) {
    setReasons((prev) => (prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]));
  }

  return createPortal(
    <>
      <div className="modal-scrim show" onClick={onClose}></div>
      <div className="modal show reason-modal" role="dialog" aria-modal="true" aria-label="Suspend indicator access">
        <div className="modal-icon fail">
          <Icon name="warning" />
        </div>
        <h3 className="modal-title">{t("suspend.title", { name: member.name })}</h3>
        <p className="modal-detail">{t("suspend.detail")}</p>
        <div className="reason-list">
          {REASON_KEYS.map((key) => (
            <label className="reason-row" key={key}>
              <input type="checkbox" checked={reasons.includes(key)} onChange={() => toggle(key)} />
              <span>{t(`suspend.reason.${key}`)}</span>
            </label>
          ))}
        </div>
        {reasons.includes("other") && (
          <textarea
            className="input reason-other"
            placeholder={t("suspend.notePlaceholder")}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            {t("suspend.keepActive")}
          </button>
          <button className="btn btn-danger" onClick={() => onConfirm(reasons, note)}>
            {t("suspend.confirm")}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
