"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "../Icon";
import { useLanguage } from "./LanguageContext";
import type { Lang } from "../../lib/i18n";

const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT_EN = MONTHS_EN.map((m) => m.slice(0, 3));

function monthNames(lang: Lang) {
  return lang === "th" ? Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString("th-TH", { month: "long" })) : MONTHS_EN;
}
function monthNamesShort(lang: Lang) {
  return lang === "th" ? Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString("th-TH", { month: "short" })) : MONTHS_SHORT_EN;
}
function dowLabels(lang: Lang) {
  return Array.from({ length: 7 }, (_, i) => new Date(2000, 0, 2 + i).toLocaleDateString(lang === "th" ? "th-TH" : "en-US", { weekday: "narrow" }));
}

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function toIso(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function parseIso(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
}

function fmtLabel(value: string, monthsShort: string[]) {
  const d = parseIso(value);
  if (!d) return null;
  return `${monthsShort[d.month]} ${d.day}, ${d.year}`;
}

export default function DatePickerField({
  value,
  onChange,
  label,
  min,
  max,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  min?: string;
  max?: string;
}) {
  const { lang, t } = useLanguage();
  const MONTHS = monthNames(lang);
  const MONTHS_SHORT = monthNamesShort(lang);
  const DOW = dowLabels(lang);
  const [open, setOpen] = useState(false);
  const parsed = parseIso(value);
  const today = new Date();
  const [viewYear, setViewYear] = useState(parsed?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? today.getMonth());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openPicker() {
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
    setOpen((v) => !v);
  }

  function changeMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
  const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());

  const cells: { iso: string; day: number; outside: boolean }[] = [];
  for (let i = 0; i < startOffset; i++) {
    const day = daysInPrevMonth - startOffset + 1 + i;
    const m = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    cells.push({ iso: toIso(y, m, day), day, outside: true });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ iso: toIso(viewYear, viewMonth, day), day, outside: false });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1];
    const lastParsed = parseIso(last.iso)!;
    const nextDate = new Date(lastParsed.year, lastParsed.month, lastParsed.day + 1);
    cells.push({ iso: toIso(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate()), day: nextDate.getDate(), outside: true });
  }

  const label_ = fmtLabel(value, MONTHS_SHORT);

  return (
    <div className="dp" ref={rootRef}>
      <button type="button" className="dp-trigger" aria-label={label} onClick={openPicker}>
        <Icon name="calendar_today" />
        <span className={label_ ? "dp-val" : "dp-ph"}>{label_ ?? label}</span>
      </button>

      {open && (
        <div className="dp-pop" role="dialog" aria-label={`${label} calendar`}>
          <div className="dp-head">
            <button type="button" className="dp-nav" aria-label="Previous month" onClick={() => changeMonth(-1)}>
              <Icon name="chevron_left" />
            </button>
            <span className="m">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" className="dp-nav" aria-label="Next month" onClick={() => changeMonth(1)}>
              <Icon name="chevron_right" />
            </button>
          </div>
          <div className="dp-grid">
            {DOW.map((d, i) => (
              <span className="dp-dow" key={i}>
                {d}
              </span>
            ))}
            {cells.map((c) => {
              const disabled = (!!min && c.iso < min) || (!!max && c.iso > max);
              return (
                <button
                  type="button"
                  key={c.iso}
                  className={`dp-day${c.outside ? " outside" : ""}${c.iso === value ? " selected" : ""}${c.iso === todayIso ? " today" : ""}`}
                  disabled={disabled}
                  onClick={() => {
                    onChange(c.iso);
                    setOpen(false);
                  }}
                >
                  {c.day}
                </button>
              );
            })}
          </div>
          <div className="dp-foot">
            <button
              type="button"
              className="dp-clear"
              onClick={() => {
                setViewYear(today.getFullYear());
                setViewMonth(today.getMonth());
              }}
            >
              {t("common.today")}
            </button>
            {value && (
              <button
                type="button"
                className="dp-clear"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                {t("common.clear")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
