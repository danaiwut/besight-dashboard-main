"use client";

import { lot } from "./CrmContext";

export default function SummaryTotalBar({ label, lots, rebate, style }: { label: string; lots: number; rebate: number; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        padding: "10px 12px",
        background: "var(--bg-card2)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        ...style,
      }}
    >
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-sub)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{lot(lots)} Lots</span>
      </span>
      <span style={{ fontSize: 16, fontWeight: 700, color: "var(--green)" }}>${rebate.toFixed(2)}</span>
    </div>
  );
}
