"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import Icon from "../Icon";

export type VerifyResult = { status: "pass" | "fail" | "pending"; title: string; detail: React.ReactNode };

const ICON: Record<VerifyResult["status"], React.ReactNode> = {
  pass: <Icon name="check_circle" />,
  fail: <Icon name="cancel" />,
  pending: <Icon name="schedule" />,
};

export default function VerifyResultModal({ result, onClose }: { result: VerifyResult | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // createPortal needs a real document.body, which only exists client-side —
    // this mount-flag effect is the standard SSR-safe portal pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  if (!mounted || !result) return null;

  return createPortal(
    <>
      <div className="modal-scrim show" onClick={onClose}></div>
      <div className="modal show" role="dialog" aria-modal="true">
        <div className={`modal-icon ${result.status}`}>{ICON[result.status]}</div>
        <h3 className="modal-title">{result.title}</h3>
        <p className="modal-detail">{result.detail}</p>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
