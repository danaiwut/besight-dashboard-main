"use client";

import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";
import Icon from "../Icon";

/**
 * Presentational slide-out drawer, rendered via portal so it can overlay
 * regardless of where in the tree it's mounted. Each page that needs one
 * (Customers, Brokers, Seller/Products, Settings/Admins) owns its own local
 * open/edit state and renders its own <Drawer> — this keeps the drawer's
 * body/footer naturally reactive to that page's state, unlike a shared
 * content-in-context approach where the stored JSX snapshot goes stale.
 */
export default function Drawer({
  open,
  title,
  onClose,
  body,
  foot,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  body: ReactNode;
  foot?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // createPortal needs a real document.body, which only exists client-side —
    // this mount-flag effect is the standard SSR-safe portal pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <>
      <div className={`scrim${open ? " show" : ""}`} onClick={onClose}></div>
      <aside className={`drawer${open ? " open" : ""}`} aria-label="Details">
        <div className="drawer-head">
          <h3>{title}</h3>
          <button className="drawer-close" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="drawer-body">{body}</div>
        <div className="drawer-foot">{foot}</div>
      </aside>
    </>,
    document.body
  );
}
