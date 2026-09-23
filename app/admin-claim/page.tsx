"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/* Admin setup: token-only, no self-request form (unlike /claim). An admin
   claim link is only ever minted by an existing admin adding a new one —
   there is nowhere on this page to ask for a fresh one, since that would
   let anyone probe which addresses belong to admins. */

const CARD: React.CSSProperties = {
  width: "100%", maxWidth: 400, background: "#151922", border: "1px solid #232938",
  borderRadius: 16, padding: 28,
};
const INPUT: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10,
  border: "1px solid #2b3244", background: "#0f131b", color: "#e8eaef", fontSize: 14, marginBottom: 14,
};
const NOTE: React.CSSProperties = { margin: "0 0 20px", fontSize: 13.5, color: "#98a1b3", lineHeight: 1.5 };

function button(disabled: boolean): React.CSSProperties {
  return {
    width: "100%", padding: "11px 12px", borderRadius: 10, border: "none",
    background: disabled ? "#2a3550" : "#3b62f6", color: "#fff", fontSize: 14,
    fontWeight: 600, cursor: disabled ? "default" : "pointer",
  };
}

function SetPassword({ token }: { token: string }) {
  const [valid, setValid] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/auth/admin-claim/complete/?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { valid?: boolean };
        if (!cancelled) setValid(Boolean(payload.valid));
      })
      .catch(() => { if (!cancelled) setValid(false); });
    return () => { cancelled = true; };
  }, [token]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) { setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน"); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/admin-claim/complete/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "ตั้งรหัสผ่านไม่สำเร็จ");
      setDone(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "ตั้งรหัสผ่านไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (valid === null) return <div style={CARD}>กำลังตรวจสอบลิงก์...</div>;

  if (!valid) {
    return (
      <div style={CARD}>
        <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700 }}>ลิงก์ใช้ไม่ได้</h1>
        <p style={NOTE}>ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว ให้เจ้าของระบบสร้างแอดมินใหม่หรือส่งลิงก์ให้อีกครั้งจากหน้า Settings</p>
        <Link href="/login" style={{ ...button(false), display: "block", textAlign: "center", textDecoration: "none", lineHeight: "22px" }}>
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div style={CARD}>
        <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700 }}>ตั้งรหัสผ่านเรียบร้อย</h1>
        <p style={NOTE}>เข้าสู่ระบบ CRM ด้วยอีเมลและรหัสผ่านใหม่ได้เลย</p>
        <Link href="/login" style={{ ...button(false), display: "block", textAlign: "center", textDecoration: "none", lineHeight: "22px" }}>
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={CARD}>
      <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700 }}>ตั้งรหัสผ่านแอดมิน</h1>
      <p style={NOTE}>ใช้อย่างน้อย 8 ตัวอักษร</p>

      <label htmlFor="pw" style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: "#b6bece" }}>รหัสผ่านใหม่</label>
      <input id="pw" type="password" required minLength={8} value={password} autoFocus autoComplete="new-password"
        onChange={(e) => setPassword(e.target.value)} style={INPUT} />

      <label htmlFor="pw2" style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: "#b6bece" }}>ยืนยันรหัสผ่าน</label>
      <input id="pw2" type="password" required minLength={8} value={confirm} autoComplete="new-password"
        onChange={(e) => setConfirm(e.target.value)} style={INPUT} />

      {error && <p style={{ margin: "0 0 14px", fontSize: 13, color: "#f4776b" }}>{error}</p>}
      <button type="submit" disabled={busy || !password || !confirm} style={button(busy || !password || !confirm)}>
        {busy ? "กำลังบันทึก..." : "บันทึกรหัสผ่าน"}
      </button>
    </form>
  );
}

function AdminClaimContent() {
  const token = useSearchParams().get("token");
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#0b0d12", color: "#e8eaef", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      {token ? (
        <SetPassword token={token} />
      ) : (
        <div style={CARD}>
          <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700 }}>ลิงก์ไม่ถูกต้อง</h1>
          <p style={NOTE}>เปิดหน้านี้จากลิงก์ที่ส่งให้ทางอีเมลเท่านั้น</p>
          <Link href="/login" style={{ ...button(false), display: "block", textAlign: "center", textDecoration: "none", lineHeight: "22px" }}>
            ไปหน้าเข้าสู่ระบบ
          </Link>
        </div>
      )}
    </main>
  );
}

export default function AdminClaimPage() {
  return (
    <Suspense fallback={null}>
      <AdminClaimContent />
    </Suspense>
  );
}
