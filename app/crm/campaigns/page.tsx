"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCrm } from "../../../components/crm/CrmContext";
import Icon from "../../../components/Icon";
import DateRangePicker, { type DateRange } from "../../../components/crm/DateRangePicker";
import { CampaignsSkeleton } from "../../../components/crm/Skeletons";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function isoDay(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
/** Default window for the lot-check panels: the last 60 days. */
function defaultTxRange(): DateRange {
  const today = new Date();
  return { from: isoDay(addDays(today, -60)), to: isoDay(today) };
}

type LotCheckData = {
  account: Array<{ campaignName: string; loginId: string; lots: number }>;
  campaigns: Array<{ campaignName: string; lots: number }>;
  countries: Array<{ country: string; lots: number }>;
  excludedSymbols: Array<{ campaignName: string; loginId: string; instrument: string; lots: number }>;
  totalLots: number;
};

type LotAutomation = {
  database: boolean;
  preview?: boolean;
  linkedMember: { id: number; code: string; name: string } | null;
  qualified: boolean | null;
  requiredLots: number | null;
  granted: number;
  renewed: number;
  skipped: string | null;
};

type ByAccountRow = { accountId: number; tradeId: string; lots: number };

type CheckPeriod = "cycle" | "entitlement" | "month" | "custom";

const PERIOD_OPTIONS: { value: CheckPeriod; label: string; hint: string }[] = [
  { value: "cycle", label: "รอบเดือนของสมาชิก", hint: "นับเป็นเดือนตามวันเริ่มสิทธิ์ เช่น เริ่ม 10 ก.พ. → 10 ก.พ.–10 มี.ค." },
  { value: "entitlement", label: "ทั้งช่วงสิทธิ์", hint: "ตั้งแต่วันเริ่มสิทธิ์ถึงวันหมดอายุทั้งหมด" },
  { value: "month", label: "เดือนนี้", hint: "เดือนปฏิทินปัจจุบัน 1 ถึงสิ้นเดือน" },
  { value: "custom", label: "กำหนดเอง", hint: "เลือกช่วงวันที่เองด้านล่าง" },
];

function LotCheckPanel() {
  const router = useRouter();
  const [range, setRange] = useState<DateRange>(defaultTxRange);
  const [period, setPeriod] = useState<CheckPeriod>("cycle");
  const [resolved, setResolved] = useState<{ from: string; to: string } | null>(null);
  const [tradeId, setTradeId] = useState("17416988");
  const [autoGrant, setAutoGrant] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ data: LotCheckData; automation: LotAutomation; memberTotal: number; byAccount: ByAccountRow[] } | null>(null);
  // Automatic grants run on the monthly cycle only — other periods are
  // view-only (forced dry-run) so one set of lots can't renew twice.
  const grantablePeriod = period === "cycle";

  async function checkLots() {
    if (period === "custom" && (!range.from || !range.to)) {
      setError("กรุณาเลือกช่วงวันที่");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/crm/lot-check/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom: range.from, dateTo: range.to, tradeId, autoGrant: autoGrant && grantablePeriod, period, dryRun: dryRun || !grantablePeriod }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; data?: LotCheckData; automation?: LotAutomation; memberTotal?: number; byAccount?: ByAccountRow[]; dateFrom?: string; dateTo?: string };
      if (!response.ok || !payload.ok || !payload.data || !payload.automation) throw new Error(payload.error || "ตรวจ Lot ไม่สำเร็จ");
      if (payload.dateFrom && payload.dateTo) setResolved({ from: payload.dateFrom, to: payload.dateTo });
      setResult({ data: payload.data, automation: payload.automation, memberTotal: payload.memberTotal ?? payload.data.totalLots, byAccount: payload.byAccount ?? [] });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ตรวจ Lot ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="panel-section-title" style={{ display: "flex", alignItems: "center", gap: 7 }}>
        ตรวจ Lot และต่อ Indicator
        <span title="ผลจาก BeSight Lot API จะถูกบันทึกและนำไปตรวจสิทธิ์สมาชิก">
          <Icon name="info" style={{ fontSize: 16, color: "var(--text-sub)" }} />
        </span>
      </div>

      <div className="toolbar" style={{ padding: "16px 0", alignItems: "flex-start" }}>
        <div className="field" style={{ marginBottom: 0, flex: "1 1 100%" }}>
          <label>ช่วงที่ตรวจ</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div className="comp-tabs" style={{ marginBottom: 0 }}>
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`comp-tab${period === option.value ? " is-active" : ""}`}
                  onClick={() => setPeriod(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 12, color: "var(--text-sub)" }}>
              {PERIOD_OPTIONS.find((option) => option.value === period)?.hint}
              {!grantablePeriod && " — ช่วงนี้ดูได้อย่างเดียว ไม่ต่ออายุจริง (dry-run)"}
            </span>
          </div>
        </div>
        {period === "custom" ? (
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220, maxWidth: 290 }}>
            <label>ช่วงวันที่</label>
            <DateRangePicker value={range} onChange={setRange} placeholder="เลือกช่วงวันที่" />
          </div>
        ) : (
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220, maxWidth: 290 }}>
            <label>ช่วงวันที่ (ระบบกำหนดจากสมาชิก)</label>
            <div className="input mono" style={{ display: "flex", alignItems: "center", fontSize: 12.5, color: "var(--text-sub)" }}>
              {resolved ? `${resolved.from} – ${resolved.to}` : "กดตรวจเพื่อดูช่วงของสมาชิก"}
            </div>
          </div>
        )}
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 180, maxWidth: 240 }}>
          <label>Trade ID</label>
          <input className="input" value={tradeId} onChange={(event) => setTradeId(event.target.value.replace(/\D/g, ""))} placeholder="เช่น 17416988" />
        </div>
        <label className="lot-auto-toggle" title={grantablePeriod ? undefined : "ต่ออัตโนมัติได้เฉพาะรอบเดือนของสมาชิก"}>
          <input type="checkbox" checked={autoGrant && grantablePeriod} disabled={!grantablePeriod} onChange={(event) => setAutoGrant(event.target.checked)} />
          <span>
            <strong>ต่อ Indicator อัตโนมัติ</strong>
            <small>{grantablePeriod ? "เมื่อ Lot ถึงเกณฑ์ของสมาชิก" : "เฉพาะรอบเดือนของสมาชิก"}</small>
          </span>
        </label>
        <label className="lot-auto-toggle" title="คำนวณและแสดงผลอย่างเดียว ไม่บันทึก LotCheckRun ไม่ต่ออายุ">
          <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} />
          <span>
            <strong>Dry-run</strong>
            <small>ดูผลก่อน ไม่บันทึก</small>
          </span>
        </label>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => void checkLots()} disabled={loading}>
          <Icon name={loading ? "progress_activity" : "query_stats"} />
          {loading ? "กำลังตรวจ..." : "ตรวจ Lot"}
        </button>
      </div>

      {error && <div className="lot-message error"><Icon name="error" />{error}</div>}

      {result && (
        <>
          <div className="stat-grid cols-3 lot-summary">
            <div className="stat-card">
              <div className="value">{result.memberTotal.toFixed(4)}</div>
              <div className="label">Lot รวมสมาชิก (ทุกบัญชี active)</div>
            </div>
            <div className="stat-card">
              <div className="value">{result.automation.requiredLots == null ? "—" : result.automation.requiredLots.toFixed(2)}</div>
              <div className="label">เกณฑ์ที่ต้องผ่าน</div>
            </div>
            <div className="stat-card">
              <div className={`value lot-result ${result.automation.qualified ? "pass" : "fail"}`}>
                {result.automation.qualified == null ? "ไม่พบสมาชิก" : result.automation.qualified ? "ผ่าน" : "ยังไม่ผ่าน"}
              </div>
              <div className="label">ผลตรวจสิทธิ์{result.automation.preview ? " (dry-run)" : ""}</div>
            </div>
          </div>

          <div className={`lot-message ${result.automation.qualified ? "success" : "neutral"}`}>
            <Icon name={result.automation.qualified ? "verified" : "info"} />
            <div>
              <strong>
                {result.automation.linkedMember ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: "2px 8px", fontWeight: 700 }}
                    onClick={() => router.push(`/crm/members/detail/?id=${result.automation.linkedMember!.id}`)}
                  >
                    {`${result.automation.linkedMember.name} · ${result.automation.linkedMember.code}`}
                  </button>
                ) : (
                  "ยังไม่ผูก Trade ID กับสมาชิกใน MariaDB"
                )}
              </strong>
              <span>
                {result.automation.granted || result.automation.renewed
                  ? `เปิดสิทธิ์ใหม่ ${result.automation.granted} และต่ออายุ ${result.automation.renewed} Indicator`
                  : result.automation.skipped || "บันทึกผลตรวจเรียบร้อย"}
              </span>
            </div>
          </div>

          {result.byAccount.length > 1 && (
            <>
              <div className="panel-section-title" style={{ marginTop: 8 }}>ยอดแยกตามบัญชี</div>
              <div className="table-wrap">
                <table className="data" style={{ minWidth: 420 }}>
                  <thead>
                    <tr>
                      <th>Trade ID</th>
                      <th>Lots</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.byAccount.map((row) => (
                      <tr key={`byacct-${row.tradeId}`}>
                        <td className="mono">{row.tradeId}</td>
                        <td className="mono">{row.lots.toFixed(8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="panel-section-title" style={{ marginTop: 8 }}>ผลของ Trade ID นี้</div>
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Login ID</th>
                  <th>Lots</th>
                </tr>
              </thead>
              <tbody>
                {result.data.account.length ? result.data.account.map((row, index) => (
                  <tr key={`account-${index}`}>
                    <td>{row.campaignName || "—"}</td>
                    <td className="mono">{row.loginId || "—"}</td>
                    <td className="mono">{row.lots.toFixed(8)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={3}><div className="table-empty">ไม่พบข้อมูลในช่วงวันที่นี้</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function LotOverviewPanel() {
  const [range, setRange] = useState<DateRange>(defaultTxRange);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<LotCheckData | null>(null);
  const [tab, setTab] = useState<"campaign" | "country" | "symbol">("campaign");

  async function load() {
    if (!range.from || !range.to) {
      setError("กรุณาเลือกช่วงวันที่");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/crm/lot-check/?date_from=${range.from}&date_to=${range.to}`, { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; error?: string; data?: LotCheckData };
      if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error || "ดึงภาพรวมไม่สำเร็จ");
      setData(payload.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ดึงภาพรวมไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  const rows: Array<{ campaignName?: string; loginId?: string; country?: string; instrument?: string; lots: number }> | undefined =
    tab === "campaign" ? data?.campaigns : tab === "country" ? data?.countries : data?.excludedSymbols;

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="panel-section-title" style={{ display: "flex", alignItems: "center", gap: 7 }}>
        ภาพรวม Lot ทั้งระบบ
        <span title="ตัวเลขในหน้านี้รวมทุกสมาชิกในระบบ ไม่ใช่ของ Trade ID ใดโดยเฉพาะ — ใช้ดูภาพรวมแคมเปญ/ประเทศ/ตราสารนอกรายการ">
          <Icon name="info" style={{ fontSize: 16, color: "var(--text-sub)" }} />
        </span>
      </div>

      <div className="toolbar" style={{ padding: "16px 0" }}>
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220, maxWidth: 290 }}>
          <label>ช่วงวันที่</label>
          <DateRangePicker value={range} onChange={setRange} placeholder="เลือกช่วงวันที่" />
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => void load()} disabled={loading}>
          <Icon name={loading ? "progress_activity" : "query_stats"} />
          {loading ? "กำลังดึงข้อมูล..." : "ดึงภาพรวม"}
        </button>
      </div>

      {error && <div className="lot-message error"><Icon name="error" />{error}</div>}

      {data && (
        <>
          <div className="tabs lot-result-tabs">
            <button className={`tab${tab === "campaign" ? " is-active" : ""}`} onClick={() => setTab("campaign")}>Campaign <span className="n">{data.campaigns.length}</span></button>
            <button className={`tab${tab === "country" ? " is-active" : ""}`} onClick={() => setTab("country")}>Country <span className="n">{data.countries.length}</span></button>
            <button className={`tab${tab === "symbol" ? " is-active" : ""}`} onClick={() => setTab("symbol")}>Symbol นอก List <span className="n">{data.excludedSymbols.length}</span></button>
          </div>

          <div className="table-wrap">
            <table className="data" style={{ minWidth: tab === "symbol" ? 760 : 520 }}>
              <thead>
                <tr>
                  {tab !== "country" && <th>Campaign</th>}
                  {tab === "symbol" && <th>Login ID</th>}
                  {tab === "country" && <th>Country</th>}
                  {tab === "symbol" && <th>Instrument</th>}
                  <th>Lots</th>
                </tr>
              </thead>
              <tbody>
                {rows?.length ? rows.map((row, index) => (
                  <tr key={`${tab}-${index}`}>
                    {tab !== "country" && <td>{row.campaignName || "—"}</td>}
                    {tab === "symbol" && <td className="mono">{row.loginId || "—"}</td>}
                    {tab === "country" && <td>{row.country || "—"}</td>}
                    {tab === "symbol" && <td className="mono">{row.instrument || "—"}</td>}
                    <td className="mono">{row.lots.toFixed(8)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4}><div className="table-empty">ไม่พบข้อมูลในช่วงวันที่นี้</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

type LotHistoryRun = {
  id: string;
  memberId: number | null;
  memberCode: string | null;
  memberName: string | null;
  tradeId: string | null;
  dateFrom: string;
  dateTo: string;
  totalLots: number;
  qualified: boolean;
  autoProcessed: boolean;
  createdAt: string;
};

function LotHistoryPanel() {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [runs, setRuns] = useState<LotHistoryRun[] | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const q = filter.trim();
      const params = new URLSearchParams({ limit: "50" });
      if (q) {
        if (/^\d+$/.test(q)) params.set("tradeId", q);
      }
      const response = await fetch(`/api/crm/lot-check/history/?${params}`, { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; error?: string; runs?: LotHistoryRun[] };
      if (!response.ok || !payload.ok || !payload.runs) throw new Error(payload.error || "ดึงประวัติไม่สำเร็จ");
      const needle = q.toLowerCase();
      setRuns(payload.runs.filter((run) =>
        !needle ||
        (run.tradeId ?? "").includes(needle) ||
        (run.memberName ?? "").toLowerCase().includes(needle) ||
        (run.memberCode ?? "").toLowerCase().includes(needle),
      ));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ดึงประวัติไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="panel-section-title" style={{ display: "flex", alignItems: "center", gap: 7 }}>
        ประวัติการตรวจ Lot
        <span title="บันทึก LotCheckRun ทุกครั้งที่ตรวจ (ยกเว้น dry-run) — กดที่ชื่อสมาชิกเพื่อเปิดหน้า detail">
          <Icon name="info" style={{ fontSize: 16, color: "var(--text-sub)" }} />
        </span>
      </div>

      <div className="toolbar" style={{ padding: "16px 0" }}>
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220, maxWidth: 290 }}>
          <label>ค้นหา (Trade ID / ชื่อ / รหัสสมาชิก)</label>
          <input
            className="input"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void load(); }}
            placeholder="เช่น 17416988"
          />
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => void load()} disabled={loading}>
          <Icon name={loading ? "progress_activity" : "history"} />
          {loading ? "กำลังดึง..." : "ดึงประวัติ"}
        </button>
      </div>

      {error && <div className="lot-message error"><Icon name="error" />{error}</div>}

      {runs && (
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th>ตรวจเมื่อ</th>
                <th>สมาชิก</th>
                <th>Trade ID</th>
                <th>ช่วงที่ตรวจ</th>
                <th>Lots (รวม)</th>
                <th>ผล</th>
              </tr>
            </thead>
            <tbody>
              {runs.length ? runs.map((run) => (
                <tr key={run.id}>
                  <td className="mono">{run.createdAt.slice(0, 16).replace("T", " ")}</td>
                  <td>
                    {run.memberId ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: "2px 8px" }}
                        onClick={() => router.push(`/crm/members/detail/?id=${run.memberId}`)}
                      >
                        {run.memberName ?? run.memberCode ?? `#${run.memberId}`}
                      </button>
                    ) : "—"}
                  </td>
                  <td className="mono">{run.tradeId || "—"}</td>
                  <td className="mono">{run.dateFrom} – {run.dateTo}</td>
                  <td className="mono">{run.totalLots.toFixed(4)}</td>
                  <td>
                    <span className={`badge ${run.qualified ? "active" : "expired"}`}>
                      {run.qualified ? "ผ่าน" : "ยังไม่ผ่าน"}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6}><div className="table-empty">ไม่พบประวัติ</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CampaignsPage() {
  const { crmDataStatus } = useCrm();
  const [tab, setTab] = useState<"lotCheck" | "lotOverview" | "history">("lotCheck");

  if (crmDataStatus === "loading") return <CampaignsSkeleton />;

  return (
    <section className="panel is-active">
      <div className="tabs" style={{ marginBottom: 18 }}>
        <button className={`tab${tab === "lotCheck" ? " is-active" : ""}`} onClick={() => setTab("lotCheck")}>
          ตรวจ Lot
        </button>
        <button className={`tab${tab === "lotOverview" ? " is-active" : ""}`} onClick={() => setTab("lotOverview")}>
          ภาพรวม Lot ทั้งระบบ
        </button>
        <button className={`tab${tab === "history" ? " is-active" : ""}`} onClick={() => setTab("history")}>
          ประวัติการตรวจ
        </button>
      </div>
      {tab === "lotCheck" ? <LotCheckPanel /> : tab === "history" ? <LotHistoryPanel /> : <LotOverviewPanel />}
    </section>
  );
}
