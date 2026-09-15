"use client";

import { useState } from "react";
import { useLanguage } from "../crm/LanguageContext";
import OpenAccountModal from "./OpenAccountModal";

export default function OpenAccountButton() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        {t("dash.accounts.openAccount")}
      </button>
      <OpenAccountModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
