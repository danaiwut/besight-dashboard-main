"use client";

import { useRef, useState } from "react";
import { useLanguage } from "../crm/LanguageContext";
import { apiCall } from "../../lib/crmApi";
import type { ImportPreviewRow, JournalTrade } from "../../lib/journal";
import Icon from "../Icon";

/** MT4/MT5 history import: paste text or upload a file → preview rows with
 *  per-line errors and duplicate flags → confirm the chosen rows. */
export default function JournalImportModal({
  accountId,
  onImported,
  onClose,
}: {
  accountId: number;
  onImported: (trades: JournalTrade[]) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ImportPreviewRow[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [working, setWorking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result || ""));
      setRows(null);
      setErrors([]);
    };
    reader.readAsText(file);
  }

  async function preview() {
    if (!text.trim() || working) return;
    setWorking(true);
    try {
      const payload = await apiCall<{ rows: ImportPreviewRow[]; errors: string[] }>(
        `/api/me/journal/accounts/${accountId}/import/`,
        "POST",
        { text },
      );
      setRows(payload.rows);
      setErrors(payload.errors);
      setSelected(new Set(payload.rows.filter((row) => !row.duplicate).map((row) => row.rowNumber)));
    } catch (previewError) {
      setErrors([previewError instanceof Error ? previewError.message : t("dash.journal.import.failed")]);
    } finally {
      setWorking(false);
    }
  }

  async function confirm() {
    if (!selected.size || working) return;
    setWorking(true);
    try {
      const payload = await apiCall<{ imported: number; skipped: number; trades: JournalTrade[] }>(
        `/api/me/journal/accounts/${accountId}/import/`,
        "POST",
        { text, confirm: [...selected] },
      );
      onImported(payload.trades);
    } catch (confirmError) {
      setErrors([confirmError instanceof Error ? confirmError.message : t("dash.journal.import.failed")]);
      setWorking(false);
    }
  }

  function toggle(rowNumber: number) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  return (
    <div>
      {rows === null ? (
        <>
          <div className="field">
            <label>{t("dash.journal.import.source")}</label>
            <textarea
              className="input mono"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("dash.journal.import.placeholder")}
              style={{ fontSize: 12 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,.xls" style={{ display: "none" }} onChange={(e) => pickFile(e.target.files?.[0])} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
              <Icon name="upload_file" style={{ fontSize: 16 }} />
              {t("dash.journal.import.file")}
            </button>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={working || !text.trim()} onClick={() => void preview()}>
              {working ? "…" : t("dash.journal.import.preview")}
            </button>
          </div>
          {!!errors.length && (
            <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--red)" }}>
              {errors.map((error, i) => (
                <div key={i}>{error}</div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {!!errors.length && (
            <div style={{ marginBottom: 12, fontSize: 12.5, color: "var(--red)" }}>
              {errors.map((error, i) => (
                <div key={i}>{error}</div>
              ))}
            </div>
          )}
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th></th>
                  <th>Ticket</th>
                  <th>Symbol</th>
                  <th>P&L</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row) => (
                    <tr key={row.rowNumber} style={row.duplicate ? { opacity: 0.55 } : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(row.rowNumber)}
                          disabled={row.duplicate}
                          onChange={() => toggle(row.rowNumber)}
                          aria-label={`Row ${row.rowNumber}`}
                        />
                      </td>
                      <td className="mono">{row.ticket}</td>
                      <td>
                        {row.symbol} <span style={{ color: "var(--text-sub)", fontSize: 11.5 }}>{row.side} · {row.lots}</span>
                      </td>
                      <td className="mono" style={{ color: row.pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                        {row.pnl.toFixed(2)}
                      </td>
                      <td style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
                        {row.duplicate ? t("dash.journal.import.duplicate") : row.error ?? ""}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>
                      <div className="table-empty">{t("dash.journal.import.noRows")}</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: "var(--text-sub)" }}>
              {t("dash.journal.import.selected", { n: selected.size })}
            </span>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRows(null); setErrors([]); }}>
              {t("common.back")}
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={working || !selected.size} onClick={() => void confirm()}>
              {working ? "…" : t("dash.journal.import.confirm", { n: selected.size })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
