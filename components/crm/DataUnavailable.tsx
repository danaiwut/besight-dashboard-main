"use client";

import { useCrm } from "./CrmContext";
import Icon from "../Icon";

/* Makes a failed backend read impossible to mistake for "there is no data".
   Before this existed, a 401 or an outage left the seeded sample rows on
   screen and the admin had no way to tell they were looking at fiction. */
export default function DataUnavailable() {
  const { crmDataError, gateRequired, crmDataStatus, reloadFromDatabase } = useCrm();
  if (crmDataStatus !== "ready" || (!crmDataError && !gateRequired)) return null;

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        margin: "0 0 16px",
        padding: "12px 14px",
        borderRadius: 12,
        background: "var(--red-bg, #fdeceb)",
        border: "1px solid var(--red, #d9534f)",
        color: "var(--red, #b02a25)",
      }}
    >
      <Icon name="error" style={{ fontSize: 18, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: "block", fontSize: 13.5 }}>
          {gateRequired ? "หมดเวลาใช้งาน" : "โหลดข้อมูลจากเซิร์ฟเวอร์ไม่สำเร็จ"}
        </strong>
        <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          {gateRequired
            ? "กรุณาเข้าสู่ระบบใหม่เพื่อดูข้อมูล — ตัวเลขที่เห็นตอนนี้ไม่ใช่ข้อมูลจริง"
            : `${crmDataError} — ส่วนที่โหลดไม่สำเร็จจะแสดงเป็นค่าว่าง ไม่ใช่ข้อมูลจริง`}
        </span>
      </div>
      {gateRequired ? (
        <a
          href={`/gate/?next=${encodeURIComponent(typeof window === "undefined" ? "/crm/" : window.location.pathname)}`}
          className="btn btn-ghost"
          style={{ flexShrink: 0 }}
        >
          เข้าสู่ระบบ
        </a>
      ) : (
        <button className="btn btn-ghost" style={{ flexShrink: 0 }} onClick={() => void reloadFromDatabase()}>
          ลองใหม่
        </button>
      )}
    </div>
  );
}
