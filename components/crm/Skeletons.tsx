"use client";

import type { CSSProperties } from "react";

/* ── Skeleton placeholders for the CRM's initial backend load ──
   Every export mirrors one real page/card layout (same classes, same
   spacing) so swapping skeleton → live data doesn't shift the page. Pages
   render these while useCrm().crmDataStatus === "loading". */

function Sk({ w, h, circle, style }: { w?: number | string; h?: number | string; circle?: boolean; style?: CSSProperties }) {
  return <span className={`skeleton${circle ? " circle" : ""}`} style={{ width: w ?? "100%", height: h ?? 12, ...style }} aria-hidden="true" />;
}

function StatCardSkeleton() {
  return (
    <div className="stat-card">
      <div className="top">
        <Sk w={38} h={38} style={{ borderRadius: 10 }} />
        <Sk w={52} h={14} />
      </div>
      <Sk w={76} h={26} style={{ marginTop: 14 }} />
      <Sk w={120} h={12} style={{ marginTop: 8 }} />
    </div>
  );
}

export function StatGridSkeleton({ count = 4, cols }: { count?: number; cols?: 3 | 5 }) {
  return (
    <div className={`stat-grid${cols ? ` cols-${cols}` : ""}`}>
      {Array.from({ length: count }, (_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function BannerSkeleton() {
  return (
    <div className="sync-banner" aria-busy="true">
      <Sk w={10} h={10} circle />
      <div>
        <Sk w={170} h={13} style={{ marginBottom: 6 }} />
        <Sk w={230} h={11} />
      </div>
    </div>
  );
}

export function ToolbarSkeleton() {
  return (
    <div className="toolbar" aria-busy="true">
      <Sk w={140} h={36} style={{ borderRadius: 8 }} />
      <Sk w={220} h={36} style={{ borderRadius: 8, flex: 1, maxWidth: 320 }} />
      <Sk w={110} h={36} style={{ borderRadius: 8, marginLeft: "auto" }} />
    </div>
  );
}

export function TableSkeleton({ cols, rows = 10, minWidth, withToolbar = true }: { cols: number; rows?: number; minWidth?: number; withToolbar?: boolean }) {
  return (
    <div className="card" aria-busy="true">
      {withToolbar && <ToolbarSkeleton />}
      <div className="table-wrap">
        <table className="data" style={minWidth ? { minWidth } : undefined}>
          <thead>
            <tr>
              {Array.from({ length: cols }, (_, i) => (
                <th key={i}>
                  <Sk w="65%" h={11} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c}>
                    {c === 0 ? (
                      <div className="cust">
                        <Sk w={34} h={34} circle />
                        <div style={{ flex: 1 }}>
                          <Sk w="70%" h={12} style={{ marginBottom: 5 }} />
                          <Sk w="50%" h={10} />
                        </div>
                      </div>
                    ) : (
                      <Sk w="55%" h={12} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <Sk w={90} h={12} />
        <Sk w={180} h={30} style={{ borderRadius: 8 }} />
      </div>
    </div>
  );
}

/* ── Page-level skeletons ── */

export function OverviewSkeleton() {
  const bars = [46, 72, 58, 84, 64, 92, 50, 78, 68, 88, 56, 74];
  return (
    <section className="panel is-active" aria-busy="true">
      <StatGridSkeleton count={5} cols={5} />
      <div className="stat-grid" style={{ gridTemplateColumns: "1fr" }}>
        <StatCardSkeleton />
      </div>
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <Sk w={190} h={16} />
          <Sk w={210} h={34} style={{ borderRadius: 8 }} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, padding: "0 4px" }}>
          {bars.map((h, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <Sk w={16} h={10} />
              <Sk w="100%" h={h} style={{ maxWidth: 28 }} />
              <Sk w={24} h={10} />
            </div>
          ))}
        </div>
      </div>
      <div className="ov-cols">
        {[4, 5].map((rows, i) => (
          <div className="card" style={{ padding: 20 }} key={i}>
            <Sk w={160} h={15} style={{ marginBottom: 18 }} />
            {Array.from({ length: rows }, (_, r) => (
              <div key={r} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <Sk w={34} h={34} circle={i === 1} style={i === 0 ? { borderRadius: 8 } : undefined} />
                <Sk w={`${58 + ((r * 13) % 30)}%`} h={11} />
                <Sk w={30} h={11} style={{ marginLeft: "auto" }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export function MembersSkeleton() {
  return (
    <section className="panel is-active" aria-busy="true">
      <BannerSkeleton />
      <StatGridSkeleton count={3} cols={3} />
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <Sk w={150} h={15} style={{ marginBottom: 14 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <Sk w={150} h={36} style={{ borderRadius: 8 }} />
          <Sk h={36} style={{ borderRadius: 8, flex: 1 }} />
          <Sk w={44} h={36} style={{ borderRadius: 8 }} />
        </div>
      </div>
      <TableSkeleton cols={10} rows={12} minWidth={1800} />
    </section>
  );
}

export function MemberDetailSkeleton() {
  return (
    <section className="panel is-active" aria-busy="true">
      <Sk w={110} h={34} style={{ borderRadius: 8, marginBottom: 16 }} />
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <Sk w={56} h={56} circle />
            <div>
              <Sk w={180} h={16} style={{ marginBottom: 8 }} />
              <Sk w={220} h={12} style={{ marginBottom: 10 }} />
              <Sk w={84} h={22} style={{ borderRadius: 999 }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Sk w={90} h={36} style={{ borderRadius: 8 }} />
            <Sk w={130} h={36} style={{ borderRadius: 8 }} />
            <Sk w={40} h={36} style={{ borderRadius: 8 }} />
          </div>
        </div>
      </div>
      <div className="form-grid2" style={{ marginBottom: 16 }}>
        {[5, 3].map((rows, i) => (
          <div className="card" style={{ padding: 20 }} key={i}>
            <Sk w={140} h={15} style={{ marginBottom: 16 }} />
            {Array.from({ length: rows }, (_, r) => (
              <div key={r} style={{ display: "flex", justifyContent: "space-between", marginBottom: 13 }}>
                <Sk w={110} h={11} />
                <Sk w={150} h={11} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="form-grid2" style={{ marginBottom: 16 }}>
        {[0, 1].map((i) => (
          <div className="card" style={{ padding: 20 }} key={i}>
            <Sk w={150} h={15} style={{ marginBottom: 16 }} />
            <Sk h={10} style={{ borderRadius: 999, marginBottom: 12 }} />
            <Sk w="60%" h={12} style={{ marginBottom: 18 }} />
            <Sk w="100%" h={34} style={{ borderRadius: 8 }} />
          </div>
        ))}
      </div>
      <TableSkeleton cols={6} rows={4} minWidth={900} withToolbar={false} />
    </section>
  );
}

export function BrokersSkeleton() {
  return (
    <section className="panel is-active" aria-busy="true">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
        <Sk w={130} h={36} style={{ borderRadius: 8 }} />
      </div>
      <div className="broker-grid2">
        {[0, 1].map((i) => (
          <div className="bk-card" key={i}>
            <div className="bk-top" style={{ marginBottom: 16 }}>
              <Sk w={46} h={46} style={{ borderRadius: 12 }} />
              <div style={{ flex: 1 }}>
                <Sk w={110} h={14} style={{ marginBottom: 6 }} />
                <Sk w={160} h={11} />
              </div>
            </div>
            <div className="bk-stats" style={{ marginBottom: 16 }}>
              {[0, 1, 2, 3].map((s) => (
                <div className="bk-stat" key={s}>
                  <Sk w={40} h={16} style={{ margin: "0 auto 6px" }} />
                  <Sk w={64} h={10} style={{ margin: "0 auto" }} />
                </div>
              ))}
            </div>
            <Sk h={36} style={{ borderRadius: 8, marginBottom: 12 }} />
            <Sk h={36} style={{ borderRadius: 8 }} />
          </div>
        ))}
      </div>
    </section>
  );
}

function CardSkeleton({ rows = 4, style }: { rows?: number; style?: CSSProperties }) {
  return (
    <div className="card" style={{ padding: 22, marginBottom: 22, ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <Sk w={170} h={15} style={{ marginBottom: 8 }} />
          <Sk w="60%" h={11} />
        </div>
        <Sk w={120} h={36} style={{ borderRadius: 8 }} />
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
          <div style={{ flex: 1 }}>
            <Sk w="55%" h={12} style={{ marginBottom: 6 }} />
            <Sk w="35%" h={10} />
          </div>
          <Sk w={70} h={26} style={{ borderRadius: 8 }} />
        </div>
      ))}
    </div>
  );
}

export function IndicatorsSkeleton() {
  return (
    <section className="panel is-active" aria-busy="true">
      <CardSkeleton rows={2} />
      <CardSkeleton rows={3} />
      <CardSkeleton rows={3} style={{ marginBottom: 0 }} />
    </section>
  );
}

export function TelegramSkeleton() {
  return (
    <section className="panel is-active" aria-busy="true">
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <Sk w={180} h={13} style={{ marginBottom: 8 }} />
            <Sk w="55%" h={11} />
          </div>
          <Sk w={100} h={36} style={{ borderRadius: 8 }} />
        </div>
      </div>
      <TableSkeleton cols={8} rows={10} minWidth={1000} />
    </section>
  );
}

export function ActivityLogsSkeleton() {
  return (
    <section className="panel is-active" aria-busy="true">
      <TableSkeleton cols={5} rows={12} minWidth={900} />
    </section>
  );
}

export function SettingsSkeleton() {
  return (
    <section className="panel is-active" aria-busy="true">
      <CardSkeleton rows={1} />
      <CardSkeleton rows={2} />
      <CardSkeleton rows={3} />
      <CardSkeleton rows={3} style={{ marginBottom: 0 }} />
    </section>
  );
}

export function CampaignsSkeleton() {
  return (
    <section className="panel is-active" aria-busy="true">
      <div className="tabs" style={{ marginBottom: 18 }}>
        {[0, 1, 2, 3].map((i) => <Sk key={i} w={i === 1 ? 150 : 105} h={34} style={{ borderRadius: 8 }} />)}
      </div>
      <div className="card" style={{ padding: 20 }}>
        <Sk w={180} h={16} style={{ marginBottom: 22 }} />
        <ToolbarSkeleton />
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 1600 }}>
            <thead><tr>{Array.from({ length: 10 }, (_, i) => <th key={i}><Sk w="65%" h={11} /></th>)}</tr></thead>
            <tbody>{Array.from({ length: 8 }, (_, r) => <tr key={r}>{Array.from({ length: 10 }, (_, c) => <td key={c}><Sk w={c === 0 ? "70%" : "45%"} h={12} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/** Compact rows for the notifications dropdown's first load. */
export function NotificationsSkeleton() {
  return (
    <div aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="notif-item" style={{ cursor: "default" }}>
          <Sk w={30} h={30} circle />
          <div className="ni-body" style={{ flex: 1 }}>
            <Sk w="85%" h={11} style={{ marginBottom: 6 }} />
            <Sk w={70} h={9} />
          </div>
        </div>
      ))}
    </div>
  );
}
