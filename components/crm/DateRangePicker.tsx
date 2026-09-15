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

function localeOf(lang: Lang) {
  return lang === "th" ? "th-TH" : "en-US";
}
function monthNames(lang: Lang) {
  return lang === "th" ? Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString("th-TH", { month: "long" })) : MONTHS_EN;
}
function monthNamesShort(lang: Lang) {
  return lang === "th" ? Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString("th-TH", { month: "short" })) : MONTHS_SHORT_EN;
}
function dowLabels(lang: Lang) {
  return Array.from({ length: 7 }, (_, i) => new Date(2000, 0, 2 + i).toLocaleDateString(localeOf(lang), { weekday: "narrow" }));
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
function fmtShort(value: string, monthsShort: string[]) {
  const d = parseIso(value);
  if (!d) return null;
  return `${monthsShort[d.month]} ${d.day}, ${d.year}`;
}
function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

type View = "day" | "month" | "year";
export type DateRange = { from: string; to: string };

export default function DateRangePicker({
  value,
  onChange,
  placeholder = "Select date range",
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  placeholder?: string;
}) {
  const { lang, t } = useLanguage();
  const MONTHS = monthNames(lang);
  const MONTHS_SHORT = monthNamesShort(lang);
  const DOW = dowLabels(lang);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("day");
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [yearBlockStart, setYearBlockStart] = useState(Math.floor(today.getFullYear() / 12) * 12);
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
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
    const anchor = parseIso(value.from) ?? parseIso(value.to);
    setViewYear(anchor?.year ?? today.getFullYear());
    setViewMonth(anchor?.month ?? today.getMonth());
    setYearBlockStart(Math.floor((anchor?.year ?? today.getFullYear()) / 12) * 12);
    setView("day");
    setPendingStart(null);
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

  function selectDay(iso: string) {
    if (!pendingStart) {
      setPendingStart(iso);
      return;
    }
    onChange(iso >= pendingStart ? { from: pendingStart, to: iso } : { from: iso, to: pendingStart });
    setPendingStart(null);
    setHoverDate(null);
    setOpen(false);
  }

  function selectMonth(year: number, month: number) {
    onChange({ from: toIso(year, month, 1), to: toIso(year, month, lastDayOfMonth(year, month)) });
    setOpen(false);
  }

  function selectYear(year: number) {
    onChange({ from: `${year}-01-01`, to: `${year}-12-31` });
    setOpen(false);
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

  const rangeStart = pendingStart ?? (value.from || null);
  const rangeEndPreview = pendingStart ? (hoverDate ?? pendingStart) : value.to || null;
  const lo = rangeStart && rangeEndPreview ? (rangeStart <= rangeEndPreview ? rangeStart : rangeEndPreview) : null;
  const hi = rangeStart && rangeEndPreview ? (rangeStart <= rangeEndPreview ? rangeEndPreview : rangeStart) : null;

  const triggerLabel = value.from || value.to ? `${fmtShort(value.from, MONTHS_SHORT) ?? "…"} – ${fmtShort(value.to, MONTHS_SHORT) ?? "…"}` : null;

  return (
    <div className="dp" ref={rootRef}>
      <button type="button" className="dp-trigger" aria-label={placeholder} onClick={openPicker}>
        <Icon name="calendar_today" />
        <span className={triggerLabel ? "dp-val" : "dp-ph"}>{triggerLabel ?? placeholder}</span>
      </button>

      {open && (
        <div className="dp-pop" role="dialog" aria-label={placeholder}>
          {view === "day" && (
            <>
              <div className="dp-head">
                <button type="button" className="dp-nav" aria-label="Previous month" onClick={() => changeMonth(-1)}>
                  <Icon name="chevron_left" />
                </button>
                <button type="button" className="dp-head-btn" onClick={() => setView("month")}>
                  {MONTHS[viewMonth]} {viewYear}
                  <Icon name="expand_more" />
                </button>
                <button type="button" className="dp-nav" aria-label="Next month" onClick={() => changeMonth(1)}>
                  <Icon name="chevron_right" />
                </button>
              </div>
              <div className="dp-grid" onMouseLeave={() => setHoverDate(null)}>
                {DOW.map((d, i) => (
                  <span className="dp-dow" key={i}>
                    {d}
                  </span>
                ))}
                {cells.map((c) => {
                  const isEndpoint = c.iso === lo || c.iso === hi;
                  const inRange = !!lo && !!hi && c.iso > lo && c.iso < hi;
                  return (
                    <button
                      type="button"
                      key={c.iso}
                      className={`dp-day${c.outside ? " outside" : ""}${isEndpoint ? " selected" : ""}${inRange ? " in-range" : ""}${c.iso === todayIso ? " today" : ""}`}
                      onMouseEnter={() => pendingStart && setHoverDate(c.iso)}
                      onClick={() => selectDay(c.iso)}
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
                {(value.from || value.to) && (
                  <button
                    type="button"
                    className="dp-clear"
                    onClick={() => {
                      onChange({ from: "", to: "" });
                      setPendingStart(null);
                      setOpen(false);
                    }}
                  >
                    {t("common.clear")}
                  </button>
                )}
              </div>
            </>
          )}

          {view === "month" && (
            <>
              <div className="dp-head">
                <button type="button" className="dp-nav" aria-label="Previous year" onClick={() => setViewYear((y) => y - 1)}>
                  <Icon name="chevron_left" />
                </button>
                <button type="button" className="dp-head-btn" onClick={() => setView("year")}>
                  {viewYear}
                  <Icon name="expand_more" />
                </button>
                <button type="button" className="dp-nav" aria-label="Next year" onClick={() => setViewYear((y) => y + 1)}>
                  <Icon name="chevron_right" />
                </button>
              </div>
              <div className="dp-month-grid">
                {MONTHS_SHORT.map((label, i) => {
                  const isCurrent = viewYear === today.getFullYear() && i === today.getMonth();
                  const isSelected = value.from === toIso(viewYear, i, 1) && value.to === toIso(viewYear, i, lastDayOfMonth(viewYear, i));
                  return (
                    <button
                      type="button"
                      key={label}
                      className={`dp-month${isCurrent ? " current" : ""}${isSelected ? " selected" : ""}`}
                      onClick={() => selectMonth(viewYear, i)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {view === "year" && (
            <>
              <div className="dp-head">
                <button type="button" className="dp-nav" aria-label="Previous years" onClick={() => setYearBlockStart((y) => y - 12)}>
                  <Icon name="chevron_left" />
                </button>
                <span className="m">
                  {yearBlockStart} – {yearBlockStart + 11}
                </span>
                <button type="button" className="dp-nav" aria-label="Next years" onClick={() => setYearBlockStart((y) => y + 12)}>
                  <Icon name="chevron_right" />
                </button>
              </div>
              <div className="dp-year-grid">
                {Array.from({ length: 12 }, (_, i) => yearBlockStart + i).map((y) => (
                  <button
                    type="button"
                    key={y}
                    className={`dp-year${y === today.getFullYear() ? " current" : ""}${value.from === `${y}-01-01` && value.to === `${y}-12-31` ? " selected" : ""}`}
                    onClick={() => selectYear(y)}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
