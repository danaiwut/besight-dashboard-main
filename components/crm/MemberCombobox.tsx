"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Member } from "./CrmContext";

function labelOf(m: Member) {
  return `${m.name} (${m.code})`;
}

export default function MemberCombobox({
  members,
  value,
  onChange,
  placeholder,
  ariaLabel,
  noneLabel,
}: {
  members: Member[];
  value: number;
  onChange: (memberId: number) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** When set, shows a selectable "none" row (memberId 0) with this label —
   *  used where a record can be added before a member has signed up yet. */
  noneLabel?: string;
}) {
  const selected = members.find((m) => m.id === value) ?? null;
  const displayLabel = selected ? labelOf(selected) : value === 0 && noneLabel ? noneLabel : "";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const q = query.trim().toLowerCase();
  const isUnfiltered = !q || q === displayLabel.toLowerCase();
  const filtered = useMemo(() => {
    if (isUnfiltered) return members;
    return members.filter((m) => (m.name + " " + m.code + " " + m.email).toLowerCase().includes(q));
  }, [members, q, isUnfiltered]);
  const showNone = !!noneLabel && (isUnfiltered || noneLabel.toLowerCase().includes(q));

  function openList() {
    setOpen(true);
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function pick(memberId: number, label: string) {
    onChange(memberId);
    setQuery(label);
    setOpen(false);
  }

  return (
    <div className="member-combo" ref={rootRef}>
      <input
        ref={inputRef}
        className="input"
        value={open ? query : displayLabel}
        placeholder={placeholder ?? "Search member…"}
        aria-label={ariaLabel ?? "Member"}
        onFocus={openList}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div className="member-combo-pop" role="listbox">
          {showNone && (
            <button type="button" className={`member-combo-item${value === 0 ? " selected" : ""}`} onClick={() => pick(0, noneLabel!)}>
              <span className="mc-name">{noneLabel}</span>
            </button>
          )}
          {filtered.length ? (
            filtered.map((m) => (
              <button type="button" key={m.id} className={`member-combo-item${m.id === value ? " selected" : ""}`} onClick={() => pick(m.id, labelOf(m))}>
                <span className="mc-name">{m.name}</span>
                <span className="mc-code">{m.code}</span>
              </button>
            ))
          ) : !showNone ? (
            <div className="member-combo-empty">No members match</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
