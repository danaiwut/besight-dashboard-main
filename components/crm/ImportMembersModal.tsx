"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useCrm, type Member, type TradeAccount, type TradeLog } from "./CrmContext";
import { useLanguage } from "./LanguageContext";
import { parseCsv, toMemberImportRows, groupMemberImportRows } from "../../lib/csvImport";

const SAMPLE_CSV =
  'Broker,Rank,รหัสสมาชิก,ชื่อ,อีเมล์,เบอร์ติดต่อ,"Trade ID",Lots,Rebate\n"XM Global",Gold,1RUFB28K1L,"Jane Doe",jane.doe@gmail.com,"","\t2920843",7.18,25.03';

function normalizeBrokerName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export default function ImportMembersModal({ onClose }: { onClose: () => void }) {
  const { members, setMembers, tradeAccounts, setTradeAccounts, tradeLogs, setTradeLogs, brokers, toast, log } = useCrm();
  const { t } = useLanguage();
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [result, setResult] = useState<{ membersAdded: number; membersMatched: number; accountsAdded: number; accountsUpdated: number; skipped: number } | null>(null);

  function runImport() {
    const rows = toMemberImportRows(parseCsv(csvText));
    const groups = groupMemberImportRows(rows);
    const today = new Date().toISOString().slice(0, 10);

    let membersAdded = 0;
    let membersMatched = 0;
    let accountsAdded = 0;
    let accountsUpdated = 0;
    let skipped = 0;

    // Computed from the current snapshot (not a setState updater) — this runs
    // once per button click, not concurrently with other member/account
    // writes, so reading `members`/`tradeAccounts` directly here is safe and
    // avoids nesting a setTradeAccounts call inside a setMembers updater
    // (which React Strict Mode's dev double-invoke would otherwise double-run).
    const nextMembers = [...members];
    const nextAccounts = [...tradeAccounts];
    const nextLogs: TradeLog[] = [];
    let nextMemberId = Math.max(0, ...nextMembers.map((m) => m.id));
    let nextAccountId = Math.max(0, ...nextAccounts.map((a) => a.id));
    let nextLogId = Math.max(0, ...tradeLogs.map((l) => l.id));

    for (const g of groups) {
      let member = nextMembers.find((m) => m.email.toLowerCase() === g.email);
      if (member) {
        membersMatched++;
      } else {
        nextMemberId++;
        const id = nextMemberId;
        member = {
          id,
          code: `BS-${String(id).padStart(4, "0")}`,
          name: g.name || g.email,
          email: g.email,
          phone: g.phone,
          tv: "",
          createdDate: today,
          joinedDate: today,
          plan: "free",
        } satisfies Member;
        nextMembers.push(member);
        membersAdded++;
      }

      const broker = brokers.find((b) => {
        const a = normalizeBrokerName(b.name);
        const c = normalizeBrokerName(g.broker);
        return c.includes(a) || a.includes(c);
      });
      if (!broker) {
        skipped += g.accounts.length;
        continue;
      }

      for (const acct of g.accounts) {
        const existing = nextAccounts.find((a) => a.tradeId === acct.tradeId);
        let accountId: number;
        if (existing) {
          existing.lastSync = today;
          accountId = existing.id;
          accountsUpdated++;
        } else {
          nextAccountId++;
          accountId = nextAccountId;
          nextAccounts.push({
            id: accountId,
            memberId: member.id,
            brokerId: broker.id,
            tradeId: acct.tradeId,
            accountType: "",
            partnerIb: broker.code,
            verification: "pending",
            createdDate: today,
            lastSync: today,
            status: "active",
          } satisfies TradeAccount);
          accountsAdded++;
        }
        nextLogId++;
        nextLogs.push({ id: nextLogId, tradeAccountId: accountId, memberId: member.id, symbol: "—", lots: acct.lots, rebate: acct.rebate, tradeDate: today });
      }
    }

    setMembers(nextMembers);
    setTradeAccounts(nextAccounts);
    // A period-level import (this CSV shape has no per-trade date) replaces
    // that account's entry for the same month rather than piling on top of
    // it, so re-running the same month's file twice doesn't double-count —
    // genuinely different months stay as separate history rows.
    const touchedThisMonth = new Set(nextLogs.map((l) => `${l.tradeAccountId}:${l.tradeDate.slice(0, 7)}`));
    setTradeLogs((cur) => [...nextLogs, ...cur.filter((l) => !touchedThisMonth.has(`${l.tradeAccountId}:${l.tradeDate.slice(0, 7)}`))]);

    log({
      actor: "Alex Dean",
      action: "Member Added",
      description: `Bulk import from CSV — ${membersAdded} member(s) created, ${membersMatched} matched by email, ${accountsAdded} trade account(s) created, ${accountsUpdated} updated${skipped ? `, ${skipped} skipped (broker not found)` : ""}.`,
    });

    setResult({ membersAdded, membersMatched, accountsAdded, accountsUpdated, skipped });
    toast(t("members.import.toast", { n: membersAdded + membersMatched }));
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setCsvText(reader.result);
    };
    reader.readAsText(f);
  }

  return createPortal(
    <>
      <div className="modal-scrim show" onClick={onClose}></div>
      <div className="modal show reason-modal" role="dialog" aria-modal="true" aria-label="Import members">
        <h3 className="modal-title" style={{ textAlign: "left" }}>
          {t("members.import.title")}
        </h3>
        <p className="modal-detail" style={{ textAlign: "left" }}>
          {t("members.import.detail")}
        </p>
        <div className="field" style={{ textAlign: "left" }}>
          <label className="btn btn-ghost" style={{ cursor: "pointer", display: "inline-flex" }}>
            {t("ta.import.uploadCsv")}
            <input type="file" accept=".csv,text/csv" hidden onChange={handleFile} />
          </label>
        </div>
        <div className="field" style={{ textAlign: "left", marginBottom: 14 }}>
          <label>{t("members.import.orPaste")}</label>
          <textarea className="input" rows={6} style={{ fontFamily: "monospace", fontSize: 12.5 }} value={csvText} onChange={(e) => setCsvText(e.target.value)} />
        </div>
        {result && (
          <p className="modal-detail" style={{ textAlign: "left" }}>
            {t("members.import.result", result)}
          </p>
        )}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            {t("ta.import.close")}
          </button>
          <button className="btn btn-primary" onClick={runImport}>
            {t("ta.import.run")}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
