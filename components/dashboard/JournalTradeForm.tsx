"use client";

import { useState } from "react";
import { useLanguage } from "../crm/LanguageContext";
import { useCrm } from "../crm/CrmContext";
import { TRADE_TAGS, type JournalTrade } from "../../lib/journal";
import SymbolPricePicker from "./SymbolPricePicker";
import Icon from "../Icon";

export type TradeFormData = {
  symbol: string;
  side: "buy" | "sell";
  openAt: string;
  closeAt: string;
  openPrice: string;
  closePrice: string;
  tp: string;
  sl: string;
  lots: string;
  pnl: string;
  commission: string;
  swap: string;
  ticket: string;
  note: string;
  tags: string[];
  isOpen: boolean;
};

function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function tradeToForm(trade?: JournalTrade | null): TradeFormData {
  return {
    symbol: trade?.symbol ?? "",
    side: trade?.side ?? "buy",
    openAt: trade ? toLocalInput(trade.openDate) : toLocalInput(new Date().toISOString()),
    closeAt: trade?.closeDate ? toLocalInput(trade.closeDate) : "",
    openPrice: trade ? String(trade.openPrice) : "",
    closePrice: trade && trade.closeDate ? String(trade.closePrice) : "",
    tp: "",
    sl: "",
    lots: trade ? String(trade.lots) : "",
    pnl: trade && trade.closeDate ? String(trade.pnl) : "",
    commission: trade?.commission != null ? String(trade.commission) : "",
    swap: trade?.swap != null ? String(trade.swap) : "",
    ticket: trade?.ticket ?? "",
    note: trade?.note ?? "",
    tags: trade?.tags ?? [],
    isOpen: trade ? !trade.closeDate : false,
  };
}

export function formToBody(form: TradeFormData): Record<string, unknown> {
  const toIso = (local: string) => (local ? new Date(local).toISOString() : null);
  return {
    symbol: form.symbol.trim().toUpperCase(),
    side: form.side,
    openAt: toIso(form.openAt),
    closeAt: form.isOpen ? null : toIso(form.closeAt),
    openPrice: form.openPrice === "" ? null : Number(form.openPrice),
    closePrice: form.isOpen || form.closePrice === "" ? null : Number(form.closePrice),
    tp: form.tp === "" ? null : Number(form.tp),
    sl: form.sl === "" ? null : Number(form.sl),
    lots: form.lots === "" ? null : Number(form.lots),
    pnl: form.isOpen || form.pnl === "" ? null : Number(form.pnl),
    commission: form.commission === "" ? 0 : Number(form.commission),
    swap: form.swap === "" ? 0 : Number(form.swap),
    ticket: form.ticket.trim() || null,
    note: form.note.trim() || null,
    tags: form.tags,
  };
}

export default function JournalTradeForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: TradeFormData;
  onSave: (data: TradeFormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const { t } = useLanguage();
  const { tradeAccounts } = useCrm();
  const [form, setForm] = useState<TradeFormData>(initial);
  const set = (patch: Partial<TradeFormData>) => setForm((cur) => ({ ...cur, ...patch }));
  const brokerSymbols = tradeAccounts.map((a) => a.tradeId);

  function usePrice(price: number, field: "open" | "close") {
    const text = String(price);
    if (field === "open") set({ openPrice: text });
    else set({ closePrice: text, isOpen: false });
  }

  function toggleTag(tag: string) {
    set({ tags: form.tags.includes(tag) ? form.tags.filter((x) => x !== tag) : [...form.tags, tag] });
  }

  const input = "input";
  return (
    <div>
      <div className="field">
        <label>{t("dash.journal.col.symbol")}</label>
        <SymbolPricePicker
          symbol={form.symbol}
          onSymbolChange={(symbol) => set({ symbol })}
          onUsePrice={usePrice}
          brokerSymbols={brokerSymbols}
        />
      </div>
      <div className="form-grid2">
        <div className="field">
          <label>{t("dash.journal.col.type")}</label>
          <select className={input} value={form.side} onChange={(e) => set({ side: e.target.value as "buy" | "sell" })}>
            <option value="buy">{t("dash.journal.buy")}</option>
            <option value="sell">{t("dash.journal.sell")}</option>
          </select>
        </div>
        <div className="field">
          <label>{t("dash.journal.form.lots")}</label>
          <input className={input} type="number" min={0} step="0.01" value={form.lots} onChange={(e) => set({ lots: e.target.value })} />
        </div>
      </div>
      <div className="form-grid2">
        <div className="field">
          <label>{t("dash.journal.form.openAt")}</label>
          <input className={input} type="datetime-local" value={form.openAt} onChange={(e) => set({ openAt: e.target.value })} />
        </div>
        <div className="field">
          <label>{t("dash.journal.col.open")}</label>
          <input className={input} type="number" step="any" value={form.openPrice} onChange={(e) => set({ openPrice: e.target.value })} />
        </div>
      </div>
      <div className="field" style={{ gridColumn: "1 / -1" }}>
        <label>{t("dash.journal.form.ticket")}</label>
        <input className={input} value={form.ticket} onChange={(e) => set({ ticket: e.target.value })} placeholder="#" />
      </div>
      <div className="form-grid2">
        <div className="field">
          <label>{t("dash.journal.form.tp")}</label>
          <input className={input} type="number" step="any" value={form.tp} onChange={(e) => set({ tp: e.target.value })} />
        </div>
        <div className="field">
          <label>{t("dash.journal.form.sl")}</label>
          <input className={input} type="number" step="any" value={form.sl} onChange={(e) => set({ sl: e.target.value })} />
        </div>
      </div>
      <label className="pop-toggle" style={{ margin: "4px 0 12px" }}>
        <input type="checkbox" checked={form.isOpen} onChange={(e) => set({ isOpen: e.target.checked })} /> {t("dash.journal.form.stillOpen")}
      </label>
      {!form.isOpen && (
        <>
          <div className="form-grid2">
            <div className="field">
              <label>{t("dash.journal.col.closedDate")}</label>
              <input className={input} type="datetime-local" value={form.closeAt} onChange={(e) => set({ closeAt: e.target.value })} />
            </div>
            <div className="field">
              <label>{t("dash.journal.col.closed")}</label>
              <input className={input} type="number" step="any" value={form.closePrice} onChange={(e) => set({ closePrice: e.target.value })} />
            </div>
          </div>
          <div className="form-grid2">
            <div className="field">
              <label>{t("dash.journal.col.pnl")} ($)</label>
              <input className={input} type="number" step="any" value={form.pnl} onChange={(e) => set({ pnl: e.target.value })} />
            </div>
            <div className="field">
              <label>{t("dash.journal.form.fees")}</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input className={input} type="number" step="any" value={form.commission} onChange={(e) => set({ commission: e.target.value })} placeholder="Comm" />
                <input className={input} type="number" step="any" value={form.swap} onChange={(e) => set({ swap: e.target.value })} placeholder="Swap" />
              </div>
            </div>
          </div>
        </>
      )}
      <div className="field">
        <label>{t("dash.journal.note.tagsLabel")}</label>
        <div className="journal-note-tag-options">
          {TRADE_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`journal-tag-chip is-selectable${form.tags.includes(tag) ? " is-active" : ""}`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>{t("dash.journal.col.note")}</label>
        <textarea className="input" rows={3} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder={t("dash.journal.note.placeholder")} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => onSave(form)}>
          <Icon name="save" style={{ fontSize: 16 }} />
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}
